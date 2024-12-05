const sampleDataFilePath = `${window.location.origin}/staff-scheduling/data/data.csv`;
const maxWorkingHoursInput = document.querySelector("#maxWorkingHours");
const fileInput = document.querySelector("#registrationFile");
const output = document.querySelector("output");
const previewBtn = document.querySelector("#formPreview");
const formSubmitBtn = document.querySelector("#formSubmit");

const userFileRadio = document.querySelector("#userFile");
const sampleFileRadio = document.querySelector("#sampleFile");

const uploadFile = document.querySelector("#uploadFile");
const form = document.querySelector("#form");

let maxWorkload = Number.MAX_SAFE_INTEGER;

let rows = [];

let dayLabels = [];
let shiftLabels = new Set(); // merely for storing inputs
let shiftIntervals = []; // sorted shifts, all calculations work on this list
let shiftIntervalIndexMap = {}; // map shift label to its interval index

let mergedIntervals = [];
let employeeNames = [];

let schedule = [];
let employees = [];


const worker = new Worker("script/generate.js");

worker.addEventListener("message", (message) => {
    schedule = message.data.schedule;
    employees = message.data.employees;
 
    displaySchedule();
})


userFileRadio.addEventListener("input", (event) => {
    uploadFile.style.display = "block";
})

sampleFileRadio.addEventListener("input", (event) => {
    uploadFile.style.display = "none";
})


previewBtn.addEventListener("click", (event) => {
    if (userFileRadio.checked && fileInput.validity.valueMissing) {
        return;
    }
    event.preventDefault();
    if (userFileRadio.checked) {
        const file = fileInput.files[0];
        getFileSummary(file);
    } else {
        fetch(sampleDataFilePath)
            .then((response) => {
                if (!response.ok) {
                    throw new Error("");
                }
                return response.blob();
            })
            .then((blob) => {
                getFileSummary(blob);
            })
            .catch((err) => console.error(err));
    }
});


formSubmitBtn.addEventListener("click", (event) => {
    if (userFileRadio.checked && fileInput.files.length === 0) {
        return;
    }
    event.preventDefault();
    maxWorkload = (maxWorkingHoursInput.value) ? Number(maxWorkingHoursInput.value): Number.MAX_SAFE_INTEGER;
    // create schedule
    retrieveFileAndGenerateSchedule();
    displaySchedule();
    fileInput.value = "";
    maxWorkingHoursInput.value = "";
});


function retrieveFileAndGenerateSchedule() {
    if (userFileRadio.checked && fileInput.files.length === 0) {
        return;
    }
    if (userFileRadio.checked) {
        generateSchedule(fileInput.files[0]);
    } else {
        fetch(sampleDataFilePath)
            .then((response) => {
                if (!response.ok) {
                    throw new Error("");
                }
                return response.blob();
            })
            .then((blob) => {
                generateSchedule(blob);
            })
            .catch((err) => console.error(err));
    }

}

function generateSchedule(file) {
    const reader = new FileReader();

    reader.addEventListener("load", function() {
        // parse text to csv
        const text = reader.result;
        extractFileInfo(text);

        // post message to worker
        worker.postMessage({
            command: "generate",
            params: {
                maxWorkload: maxWorkload,
                rows: encodeRows(),
                shiftIntervals: shiftIntervals
            }
        });
    })
    
    reader.readAsText(file);
}


function getFileSummary(file) {
    const reader = new FileReader();

    reader.addEventListener("load", function() {
        // parse text to csv
        const text = reader.result;

        extractFileInfo(text);

        // display the result to the output
        displayFileSummary();
    })
    
    reader.readAsText(file);
}

function extractFileInfo(text) {
    rows = text.split('\n').map(row => row.split(','));

    const m = rows.length;
    const n = rows[0].length;

    // extract the day labels
    dayLabels = rows[0].slice(1,);

    // extract employee names
    employeeNames = [];
    for (let i = 1; i < m; i++) {
        employeeNames.push(rows[i][0]);
    }

    // extract shifts
    shiftLabels = new Set();
    for (let r = 1; r < m; r++) {
        for (let c = 1; c < n; c++) {
            const labels = rows[r][c].split(';');
            for (const label of labels) {
                const trimmedLabel = label.trim();
                if (trimmedLabel) {
                    shiftLabels.add(trimmedLabel);
                }
            }
        }
    }

    // convert shift labels to sorted intervals
    [shiftIntervals, shiftIntervalIndexMap] = getSortedIntervals(shiftLabels);

    mergedIntervals = mergeIntervals(shiftIntervals);
}


function encodeRows() {
    const encodedRows = [];

    for (let row = 1; row < rows.length; row++) { // r: index of employee
        // add row for this employee
        encodedRows.push([]); // this list stores lists of available shifts in each workday
        const employeeId = row - 1;

        for (let col = 1; col < rows[0].length; col++) { // c: index of work day
            const availableShifts = rows[row][col].split(';')
                .map(label => label.trim())
                .filter(item => item !== "")
                .map(label => shiftIntervalIndexMap[label])
            
            encodedRows[employeeId].push(availableShifts);
        }
    }
    return encodedRows;
}

function displayFileSummary() {
    while (output.firstChild) {
        output.removeChild(output.firstChild);
    }

    const section  = document.createElement("section");

    const h2 = document.createElement("h2");
    h2.textContent = "File Summary";

    const table = document.createElement("table");

    // thead
    const tHead = document.createElement("thead");

    const headerRow = document.createElement("tr");

    const dayHeader  = document.createElement("th");
    dayHeader.textContent = "Work days";

    const shiftHeader  = document.createElement("th");
    shiftHeader.textContent = "Work shifts";

    const workHourHeader = document.createElement("th");
    workHourHeader.textContent = "Work hours";

    const employeeHeader = document.createElement("th");
    employeeHeader.textContent = "Employees";

    headerRow.appendChild(dayHeader);
    headerRow.appendChild(shiftHeader);
    headerRow.appendChild(workHourHeader);
    headerRow.appendChild(employeeHeader);
    tHead.appendChild(headerRow);
    

    // body
    const tBody = document.createElement("tbody");
    const bodyRow = document.createElement("tr");

    const dayContent = document.createElement("td");
    const dayPara = document.createElement("p");
    dayPara.textContent = `${dayLabels.length} work days:`;
    const daysList = document.createElement("ul");
    for (const dayLabel of dayLabels) {
        const li = document.createElement("li");
        li.textContent = dayLabel;
        daysList.appendChild(li);
    }
    dayContent.appendChild(dayPara);
    dayContent.appendChild(daysList);

    const shiftContent = document.createElement("td");
    const shiftPara = document.createElement("p");
    shiftPara.textContent = `${shiftIntervals.length} shifts available in a workday:`;
    const shiftsList = document.createElement("ul");
    for (const interval of shiftIntervals) {
        const li = document.createElement("li");
        li.textContent = `${String(interval[0]).padStart(2, "0")} - ${String(interval[1]).padStart(2, "0")}`;
        shiftsList.appendChild(li);
    }
    shiftContent.appendChild(shiftPara);
    shiftContent.appendChild(shiftsList);
    
    const workingHourContent = document.createElement("td");
    const workingHourPara = document.createElement("p");
    workingHourPara.textContent = "Based on the shift information, your working hours:";
    const workingHoursList = document.createElement("ul");
    for (const interval of mergedIntervals) {
        const li = document.createElement("li");
        li.textContent = `${String(interval[0]).padStart(2, "0")} - ${String(interval[1]).padStart(2, "0")}`;
        workingHoursList.appendChild(li);
    }
    workingHourContent.appendChild(workingHourPara);
    workingHourContent.appendChild(workingHoursList);

    const employeeContent = document.createElement("td");
    const employeePara = document.createElement("p");
    employeePara.textContent = `${employeeNames.length} employees:`;
    const employeesList = document.createElement("ul");
    for (const employeeName of employeeNames) {
        const li = document.createElement("li");
        li.textContent = employeeName;
        employeesList.appendChild(li);
    }
    employeeContent.appendChild(employeePara);
    employeeContent.appendChild(employeesList);

    bodyRow.appendChild(dayContent);
    bodyRow.appendChild(shiftContent);
    bodyRow.appendChild(workingHourContent);
    bodyRow.appendChild(employeeContent);

    tBody.appendChild(bodyRow);

    table.appendChild(tHead);
    table.appendChild(tBody);

    section.appendChild(h2);
    section.appendChild(table);
    section.setAttribute("class", "summary");

    output.appendChild(section);
    output.scrollIntoView({ behavior: "smooth" });
}


function getSortedIntervals(labels) {
    const labelMap = {}; // map the interval with corr shift label

    const intervals = [];
    // convert shift labels to list of intervals [start_time, endtime], sorted by start time
    for (const label of labels) {
        const parts = label.split('-');
        const startTime = Number(parts[0]);
        const endTime = Number(parts[1]);
        const interval = [startTime, endTime];
        intervals.push(interval);
        
        labelMap[interval] = label;
    }

    // sort intervals by start time
    intervals.sort((a, b) => a[0] - b[0]);

    // generate index map
    const indexMap = {}; // map shift label with index of interval after sorted
    for (let i = 0; i < intervals.length; i++) {
        const label = labelMap[intervals[i]];
        indexMap[label] = i;
    }

    return [intervals, indexMap];
}

function mergeIntervals(intervals) {
    const merged = [];
    if (intervals.length === 0) {
        return merged;
    }

    const firstInterval = intervals[0];
    merged.push([firstInterval[0], firstInterval[1]]);

    for (let i = 1; i < intervals.length; i++) {
        const curr = intervals[i];
        const prev = merged[merged.length - 1];

        if (curr[0] > prev[1]) {
            merged.push([curr[0], curr[1]]);
        } else {
            prev[1] = Math.max(prev[1], curr[1]);
        }
    }

    return merged;

}

function displaySchedule() {
    // clear output
    while (output.firstChild) {
        output.removeChild(output.firstChild);
    }

    const section = document.createElement("section");

    const h2 = document.createElement("h2");
    h2.textContent = "Suggested Schedule";

    const table = document.createElement("table");

    // header
    const tHeader = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const firstCell = document.createElement("th");
    firstCell.innerHTML = "Employee";
    headerRow.appendChild(firstCell);

    for (const dayLabel of dayLabels) {
        const th = document.createElement("th");
        th.textContent = dayLabel;
        headerRow.appendChild(th);
    }
    const lastTd = document.createElement("th");
    lastTd.textContent = "Workload";
    headerRow.appendChild(lastTd);

    tHeader.appendChild(headerRow);
    table.appendChild(tHeader);

    // body

    const tBody = document.createElement("tbody");

    for (let employeeId = 0; employeeId < employees.length; employeeId++) {
        const row = document.createElement("tr");
        
        // employeeName label
        const th = document.createElement("th");
        th.textContent = `${employeeNames[employeeId]}`;
        row.appendChild(th);
        
        // assigned shifts of this worker on each day
        for (let dayId = 0; dayId < dayLabels.length; dayId++) {
            const shiftId = schedule[employeeId][dayId];

            // cell for the shift
            const td = document.createElement("td");
            td.textContent = (shiftId != -1) ?`${String(shiftIntervals[shiftId][0]).padStart(2, "0")} - ${String(shiftIntervals[shiftId][1]).padStart(2, "0")}`: "N/A";
            row.appendChild(td);
        }

        // workload
        const td = document.createElement("td");
        td.textContent = `${employees[employeeId].workload}`;
        row.appendChild(td);

        tBody.appendChild(row);
    }
    table.appendChild(tBody);

    section.appendChild(h2);
    section.appendChild(table);
    section.setAttribute("class", "schedule");
    
    output.appendChild(section);
    output.scrollIntoView({ behavior: "smooth" });
}
