// Code.gs

// 1. SERVE THE HTML
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Referral Portal')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// 2. DATABASE CONNECTION HELPER
function getSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return ss.insertSheet(sheetName);
  return sheet;
}

// 3. SECURITY & AUTH (SHA-256 Hashing)
function hashPassword(password) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  var txtHash = '';
  for (i = 0; i < rawHash.length; i++) {
    var hashVal = rawHash[i];
    if (hashVal < 0) {
      hashVal += 256;
    }
    if (hashVal.toString(16).length == 1) {
      txtHash += '0';
    }
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

function handleLogin(username, password) {
  var sheet = getSheet('credentials');
  var data = sheet.getDataRange().getValues();
  // Remove headers
  data.shift(); 
  
  var targetHash = hashPassword(password);
  
  // Find user
  for(var i=0; i<data.length; i++) {
    if(data[i][0] == username && data[i][1] == targetHash) {
      return {success: true, username: username};
    }
  }
  return {success: false, message: "Invalid credentials."};
}

function handleSignup(username, password) {
  var sheet = getSheet('credentials');
  var data = sheet.getDataRange().getValues();
  
  // Check if user exists
  for(var i=1; i<data.length; i++) {
    if(data[i][0] == username) {
      // User exists, we update the password (simple reset flow based on prompt)
      sheet.getRange(i+1, 2).setValue(hashPassword(password));
      return {success: true, message: "Password updated successfully. Please login."};
    }
  }
  
  // Create new user
  sheet.appendRow([username, hashPassword(password), new Date()]);
  return {success: true, message: "Account created! Please login."};
}



// 4. REFERRAL LOGIC
function submitReferral(formObject, username) {
  try {
    var sheet = getSheet('referrals');
    var id = Utilities.getUuid(); 
    
    sheet.appendRow([
      id,
      username,
      formObject.phone, 
      formObject.email,
      formObject.consentDriver,
      formObject.consentShare,
      "",
      new Date()
    ]);
    
    return {success: true};
  } catch (e) {
    return {success: false, error: e.toString()};
  }
  

}


// UPDATED FUNCTION: Returns ALL data for the user
function getMyReferrals(username) {
  var sheet = getSheet('referrals');
  var data = sheet.getDataRange().getValues();
  // Remove headers
  data.shift();
  
  var results = [];
  
  for(var i=0; i<data.length; i++) {
    // Column Index: 0=ID, 1=User, 2=Phone, 3=Email, 4=Con1, 5=Con2, 6=Status, 7=Date
    var rowUser = data[i][1];
    
    if(rowUser === username) {
      // We send the date as an ISO string so JS can easily parse it
      var dateObj = new Date(data[i][7]);
      
      results.push({
        id: data[i][0],
        phone: data[i][2],
        email: data[i][3],
        status: data[i][6],
        date: dateObj.toISOString() 
      });
    }
  }
  
  // Sort by date (Newest First)
  results.sort(function(a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  return results;
}


function fetchPerformanceData() {
  // Replace with your source spreadsheet ID and sheet name
  const SOURCE_SPREADSHEET_ID = "";
  const SOURCE_SHEET_NAME = "";
  const TARGET_SHEET_NAME = "";

  // Open the source spreadsheet and get the sheet
  const sourceSpreadsheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(SOURCE_SHEET_NAME);

  // Open the target spreadsheet (current spreadsheet) and get the sheet
  const targetSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = targetSpreadsheet.getSheetByName(TARGET_SHEET_NAME);

  // Get data from columns B to E of the source sheet
  const sourceRange = sourceSheet.getRange(1, 2, sourceSheet.getLastRow(), 6); // Starting from column B (2), spanning 4 columns
  const sourceData = sourceRange.getValues();

  // Check if the source sheet contains data (not just headers or empty rows)
  const hasData = sourceData.some(row => row.some(cell => cell !== ""));

  if (hasData) {
    // Clear all data in the target sheet, except the header row (if any)
    targetSheet.clear(); // Clears all data in the sheet

    // Copy data from source to target
    targetSheet.getRange(1, 1, sourceData.length, sourceData[0].length).setValues(sourceData);
  } else {
  }
}


function fetchChurnData() {
  // --- CONFIGURATION ---
  const SOURCE_SPREADSHEET_ID = ""; // Remember to fill this in
  const SOURCE_SHEET_NAME = "";
  const TARGET_SHEET_NAME = "";
  const CHUNK_SIZE = 5000; // Number of rows to process at a time (adjust as needed)

  // --- SETUP ---
  const sourceSpreadsheet = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(SOURCE_SHEET_NAME);

  const targetSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = targetSpreadsheet.getSheetByName(TARGET_SHEET_NAME);

  // Get total rows to process
  const totalRows = sourceSheet.getLastRow();

  // If source is empty, do nothing
  if (totalRows === 0) {
    Logger.log("Source sheet is empty.");
    return;
  }

  // Clear the target sheet once before starting the loop
  targetSheet.clear();

  // --- CHUNKING LOOP ---
  // We loop from row 1 up to the last row, incrementing by CHUNK_SIZE
  for (let startRow = 1; startRow <= totalRows; startRow += CHUNK_SIZE) {
    
    // Calculate how many rows to grab in this specific iteration
    // It will be CHUNK_SIZE, unless we are at the end and have fewer rows left
    const remainingRows = totalRows - startRow + 1;
    const rowsToGet = Math.min(CHUNK_SIZE, remainingRows);

    // 1. Get the chunk from Source (Columns B to E = Start Col 2, Num Cols 4)
    const chunkValues = sourceSheet.getRange(startRow, 2, rowsToGet, 6).getValues();

    // 2. Check for data (Optional optimization: skip writing if the whole chunk is empty)
    const hasData = chunkValues.some(row => row.some(cell => cell !== ""));

    if (hasData) {
      // 3. Write the chunk to Target (Starting at Col A = Start Col 1)
      // We use 'startRow' here to ensure it pastes in the exact same position it came from
      targetSheet.getRange(startRow, 1, rowsToGet, 6).setValues(chunkValues);
      
      // Force the changes to apply immediately (helps with memory management)
      SpreadsheetApp.flush();
    }
    
  }

}


function validateNewRecords() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Get the "Referrals" sheet
  var referralsSheet = ss.getSheetByName("referrals");
  var lastRow = referralsSheet.getLastRow(); 
  
  // Get the referral code,  phone number and email address from the last row of the referral sheet
  var referrerCode = referralsSheet.getRange(lastRow, 2).getValue(); // Scout Code 
  var churnDriverPhone = referralsSheet.getRange(lastRow, 3).getValue(); // Churned Driver's Phone Number
  var churnDriverEmail = referralsSheet.getRange(lastRow, 4).getValue(); // Churned Driver's Email address 
  
  var scoutSheet = ss.getSheetByName("credentials");
  var churnDriversSheet = ss.getSheetByName("Churned Drivers");
  
  // Get the data from the respective columns in the "Scouts" sheet
  var codeScout = scoutSheet.getRange(2, 1, scoutSheet.getLastRow() - 1, 1).getValues(); // Column A (Referral Code)
  var driverIDscout = scoutSheet.getRange(2, 3, scoutSheet.getLastRow() - 1, 1).getValues(); // Column B (Scout IDs)
  


  // Get the data from the respective columns in the "Churned Drivers" sheet
  var churnedDriverPhone = churnDriversSheet.getRange(2, 3, churnDriversSheet.getLastRow() - 1, 1).getValues(); 
  var churnedDriverEmail = churnDriversSheet.getRange(2, 4, churnDriversSheet.getLastRow() - 1, 1).getValues(); 
  var churnedDriverID = churnDriversSheet.getRange(2, 1, churnDriversSheet.getLastRow() - 1, 1).getValues(); 
  var churnedDriverCity = churnDriversSheet.getRange(2, 6, churnDriversSheet.getLastRow() - 1, 1).getValues(); 
  

  // Flatten the phone and email data for easier searching
  var codeList = codeScout.map(function(row) { return row[0]; });
  var iDList = driverIDscout.map(function(row) { return row[0]; });


  var phoneListChurn = churnedDriverPhone.map(function(row) { return row[0]; });
  var emailListChurn = churnedDriverEmail.map(function(row) { return row[0]; });
  var driverIDListChurn = churnedDriverID.map(function(row) { return row[0]; });
  var cityListChurn = churnedDriverCity.map(function(row) { return row[0]; });
  


  // Check if the Scout Referral Code  is in column A of the "Scouts" sheet
  var index = codeList.indexOf(referrerCode);
  if (index !== -1) {
    referralsSheet.getRange(lastRow, 9).setValue(iDList[index]); // Update column K with the ID of the scout
  } 

  // Check if the phone exists in column C of the "Churned Drivers" sheet
  var indexChurn = phoneListChurn.indexOf(churnDriverPhone);
  if (indexChurn !== -1) {
    referralsSheet.getRange(lastRow, 11).setValue("Eligible"); 
    referralsSheet.getRange(lastRow, 10).setValue(driverIDListChurn[indexChurn]); 
    referralsSheet.getRange(lastRow, 12).setValue(emailListChurn[indexChurn]); 
    referralsSheet.getRange(lastRow, 13).setValue(cityListChurn[indexChurn]); 

  } 
  // If the phone is not found, check if the email exists in column D
  else {
    indexChurn = emailListChurn.indexOf(churnDriverEmail);
    if (indexChurn !== -1) {
      referralsSheet.getRange(lastRow, 11).setValue("Eligible"); 
      referralsSheet.getRange(lastRow, 10).setValue(driverIDListChurn[indexChurn]); 
      referralsSheet.getRange(lastRow, 12).setValue(emailListChurn[indexChurn]); 
      referralsSheet.getRange(lastRow, 13).setValue(cityListChurn[indexChurn]); 
    } else {
      referralsSheet.getRange(lastRow, 11).setValue("Not Eligible"); // Update column J to "Not Eligible"
      referralsSheet.getRange(lastRow, 12).setValue("noreply-invalid@invalid-referrals.com"); // Update column J to "Not Eligible"

    }
  }
  
}



function duplicateCounter() {
  // 1. SAFETY WRAPPER: Prevents this function from stopping the rest of the chain
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("referrals");
    var lastRow = sheet.getLastRow();
    
    // Safety check for empty sheet
    if (lastRow < 2) return;

    // Get current data
    var currentPhone = sheet.getRange(lastRow, 3).getValue();
    var currentStatus = sheet.getRange(lastRow, 11).getValue();

    // --- LOGIC CHANGE FOR "NOT ELIGIBLE" ---
    // If status is NOT Eligible (and not "In progress"), set empty and stop.
    if (currentStatus !== "Eligible") {
      sheet.getRange(lastRow, 14).setValue(""); // Set Column N to empty
      return; // Exit function successfully immediately
    }

    // --- CALCULATE DUPLICATES (Only runs if Eligible) ---
    var duplicateCount = 1;
    
    // Get previous data (Phone is Col 0 in array, Status is Col 8 in array)
    var previousData = sheet.getRange(2, 3, lastRow - 2, 9).getValues(); 

    for (var i = 0; i < previousData.length; i++) {
      var prevPhone = previousData[i][0];
      var prevStatus = previousData[i][8];

      // Check for match
      if (String(prevPhone) === String(currentPhone) && 
         (prevStatus === "Eligible" || prevStatus === "Duplicate")) {
        duplicateCount++;
      }
    }

    // --- UPDATE SHEET ---
    if (duplicateCount > 1) {
      sheet.getRange(lastRow, 11).setValue("Duplicate");
      sheet.getRange(lastRow, 14).setValue(duplicateCount);
    } else {
      // If count is 1 (unique), set to 1 or empty depending on your preference.
      // Usually "1" is helpful to show it was checked.
      sheet.getRange(lastRow, 14).setValue(duplicateCount);
    }

  } catch (e) {
    // IF AN ERROR OCCURS:
    // Log it to the execution transcript so you can debug later
    
    // Crucially, we DO NOT throw the error again. 
    // This allows processNewReferrals() to continue to moveReferralData().
  }
}


function moveReferralData(){
  var sourceSheetName = "referrals";  
  var destinationSheetName = "valid referrals";
  var failedReferralSheetName = "invalid referrals"
  
  // Get the spreadsheet and sheets
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = spreadsheet.getSheetByName(sourceSheetName);
  var destinationSheet = spreadsheet.getSheetByName(destinationSheetName);
  var failedReferralSheet = spreadsheet.getSheetByName(failedReferralSheetName)
  
  // Get the last row in the source sheet
  var lastRowNew = sourceSheet.getLastRow();

  // Get the values in columns I, J, and G in the last row
  var churnDPhone = sourceSheet.getRange(lastRowNew, 3).getValue(); 
  var churnedDriverEmail = sourceSheet.getRange(lastRowNew, 4).getValue();
  var driverEligibility = sourceSheet.getRange(lastRowNew, 11).getValue(); // Churned Driver Eligibility
  var scoutID = sourceSheet.getRange(lastRowNew, 9).getValue(); // Scout ID
  var churnDriverID = sourceSheet.getRange(lastRowNew, 10).getValue(); // Churned Driver ID
  var duplicateCount = sourceSheet.getRange(lastRowNew, 14).getValue(); 


  // Check if the values the scout is Eligible to refer drivers and if the driver who has been referred is a churned driver. 
  if (driverEligibility === "Eligible" & duplicateCount === 1) {
    var destinationLastRow = destinationSheet.getLastRow() + 1;


      // Paste the value from column G into the next available row in the "Performance" sheet
      destinationSheet.getRange(destinationLastRow, 9).setValue(scoutID);  // Column A is the first column in destination
      destinationSheet.getRange(destinationLastRow, 1).setValue(churnDriverID);  // Column J is the first column in destination

  }

   // Check if the values in I and J are "Eligible"
  else if (driverEligibility === "Not Eligible"|| driverEligibility === "") {
    var failedReferralLastRow = failedReferralSheet.getLastRow()+1;

    // Paste the value from column G into the next available row in the "Performance" sheet
      failedReferralSheet.getRange(failedReferralLastRow, 1).setValue(churnDPhone);  // Updates the last row with the churned driver's phone nummber in column A
      failedReferralSheet.getRange(failedReferralLastRow, 2).setValue(churnedDriverEmail);  // Updates the last row with the churned driver's email address in column B
      failedReferralSheet.getRange(failedReferralLastRow, 3).setValue(scoutID);  // Updates the last row with the scout id in column C
 
  }

}


function updateReactivationAndLastRideDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var referralsSheet = ss.getSheetByName('valid referrals');
  var activitySheet = ss.getSheetByName('Driver Activity');

  // Get all data from both sheets
  var referralsData = referralsSheet.getDataRange().getValues();
  var activityData = activitySheet.getDataRange().getValues();

  // Create a map for quick lookup of Reactivation Date by User ID
  var activityMap = {};
  for (var i = 1; i < activityData.length; i++) {
    var userId = activityData[i][0]; // Column A in "Driver Activity"
    var reactivationDate = activityData[i][1]; // Column B in "Driver Activity"
    if (userId) {
      activityMap[userId] = reactivationDate;
    }
  }

  var updates = [];

  // Loop through Valid Referrals and update the correct column
  for (var j = 1; j < referralsData.length; j++) {
    var userId = referralsData[j][0]; // Column A in "Valid Referrals"
    var activityCount = referralsData[j][1]; // Column B (Activity Count from VLOOKUP)
    var reactivationDate = referralsData[j][4]; // Column E (Reactivation Date)
    var lastRideDate = referralsData[j][5]; // Column F (Last Ride Date)

    if (activityCount >= 0 && activityMap[userId]) {
      if (!reactivationDate) {
        updates.push([j + 1, 5, activityMap[userId]]); // Update Column E if empty
      } else {
        updates.push([j + 1, 6, activityMap[userId]]); // Otherwise, update Column F
      }
    }
  }

  // Apply all updates in one go
  updates.forEach(update => referralsSheet.getRange(update[0], update[1]).setValue(update[2]));
}
  


function compenationDueCheck() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Define source and target sheets
  var sourceSheet = ss.getSheetByName("valid referrals"); 
  var targetSheet = ss.getSheetByName("compensation due"); 

  // Define the column to check for the condition (e.g., Column C is 3)
  var conditionColumn = 10; 
  var conditionString = "Completed"; 

  // Get the data range excluding the header
  var lastRow = sourceSheet.getLastRow();
  var lastColumn = sourceSheet.getLastColumn();

  // Start from row 2 to avoid header
  for (var i = lastRow; i >= 2; i--) { // Reverse loop to prevent skipping rows
    var cellValue = sourceSheet.getRange(i, conditionColumn).getValue();
    if (cellValue === conditionString) {
      // Get the entire row to move
      var rowValues = sourceSheet.getRange(i, 1, 1, lastColumn).getValues()[0];
      
      // Append the row to the target sheet
      targetSheet.appendRow(rowValues);
      
      // Delete the row from the source sheet
      sourceSheet.deleteRow(i); 
    }
  }
}

function processEscalatedReferrals() {
  // --- CONFIGURATION ---
  const sourceSheetName = "invalid referrals";
  const targetSheetName = "valid referrals";


  // --- SETUP SHEETS ---
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(sourceSheetName);
  const targetSheet = ss.getSheetByName(targetSheetName);


  // --- PROCESS SOURCE DATA ---
  const dataRange = sourceSheet.getDataRange();
  const data = dataRange.getValues();
  data.shift(); // Remove headers

  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    let rowIndex = i + 2; // 1-based index + header offset

    // Conditions: 
    // Col 4 (idx 3) == "Eligible"
    // Col 6 (idx 5) == "Escalated"
    // Col 7 (idx 6) != ""
    // Col 10 (idx 9) == "" (Not yet resolved)
    // Col 11 (idx 10) == 0
    if (row[3] === "Eligible" && row[5] === "Escalated" && row[6] !== "" && row[9] === "" && row[10] === 0) {
      

      // 2. PREPARE TARGET DATA
      // row[2] = Column 3 (Search Value)
      // row[5] = Column 6
      
      const targetData = [
        row[6],                    // Churned Driver ID
        "", "", "", "", "", "", "", // Placeholders
        row[2],                    // Scout ID
      ];

      // 3. INSERT INTO TARGET SHEET
      targetSheet.appendRow(targetData);

      // 4. MARK AS RESOLVED
      sourceSheet.getRange(rowIndex, 10).setValue("Resolved");
    }
  }
}
