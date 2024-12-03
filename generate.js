let maxWorkload = 0;
let rows = []; // input
let shiftIntervals = []; // input // sorted shifts, all calculations work on this list 

let numEmployees = 0; // get from rows
let numDays = 0; // get from rows
let availability = []; // day x shift
let schedule = []; // employee x day
let employees = [];
let coveredIntervals = []; // intervals have been covered in each work day


addEventListener("message", (message) => {
    if (message.data.command == "generate") {
        // generate schedule
        generateSchedule(message.data.params);
    }
})

class MinHeap {
    #heap;
    #comparableFn; // function to compare 2 objects in heap, return -1, 0, 1

    constructor(comparableFn) {
        this.#heap = [];
        this.#comparableFn = comparableFn;
    }

    isEmpty() {
        return this.#heap.length === 0;
    }

    poll() {
        // extract min
        if (this.isEmpty()) {
            throw new Error("Heap is empty. No items to poll.");
        }
        const minItem = this.#heap[0];
        
        // replace first item with last item
        this.#heap[0] = this.#heap[this.#heap.length -1];

        // remove the last item
        this.#heap.pop();

        // minheapify first item
        this.#minHeapify(0);

        return minItem;
    }

    offer(item) {
        // add new item to min heap
        this.#heap.push(item);

        // bubble item while item < parent
        let i = this.#heap.length -1;
        while (i > 0 && this.#comparableFn(this.#heap[i], this.#heap[this.#parent(i)]) < 0) {
            // bubble up item
            const parent = this.#parent(i);

            const temp = this.#heap[i];
            this.#heap[i] = this.#heap[parent];
            this.#heap[parent] = temp;

            i = parent;
        }
    }

    #parent(i) {
        return Math.floor((i - 1)/2);
    }

    #minHeapify(i) {
        // i is the index of the item/node to min heapify
        const l = 2*i + 1;
        const r = 2*i + 2;
        let smallest = i;

        if (l < this.#heap.length && this.#comparableFn(this.#heap[l], this.#heap[smallest]) < 0) {
            smallest = l;
        }
        if (r < this.#heap.length && this.#comparableFn(this.#heap[r], this.#heap[smallest]) < 0) {
            smallest = r;
        }

        if (smallest != i) {
            // exchange items in position smallest and i
            const temp = this.#heap[i];
            this.#heap[i] = this.#heap[smallest];
            this.#heap[smallest] = temp;

            this.#minHeapify(smallest);
        }
    }

}

class Employee {
    id;
    workload;

    constructor(id) {
        this.id = id;
        this.workload = 0;
    }

    addWorkload(amount) {
        this.workload += amount;
    }

    removeWorkload(amount) {
        this.workload -= amount;
    }
}

function generateSchedule(params) {
    // let {maxWorkload, rows, shiftIntervals } = params;
    maxWorkload = params.maxWorkload;
    rows = params.rows;
    shiftIntervals = params.shiftIntervals;

    numEmployees = rows.length;
    numDays = rows[0].length;

    // create availability (availability[dayId][shiftId] => list of available employees)
    initializeAvailability();
    initializeEmployees();
    initializeSchedule();
    initializeCoveredIntervals();

    for (let dayId = 0; dayId < numDays; dayId++) {
        // sorted shift ids;
        
        const sortedShiftIds = sortShifts(dayId);
        for (const shiftId of sortedShiftIds) {
            const shiftInterval = shiftIntervals[shiftId];
            const startTime = shiftInterval[0];
            const endTime = shiftInterval[1];
            if (!isCovered(dayId, startTime, endTime)) {
                const assignedEmployeeId = assignEmployee(dayId, shiftId);
                // if assign successful, update schedule, insert covered interval, increase employee workload
                if (assignedEmployeeId != -1) {
                    schedule[assignedEmployeeId][dayId] = shiftId;
                    employees[assignedEmployeeId].addWorkload(endTime - startTime)
                    insertCoveredInterval(dayId, shiftId);
                }

            }
        }
        optimizeSchedule(dayId);
    }

    postMessage({
        schedule: schedule,
        employees: employees
    });
    
}

function sortShifts(dayId) {
    const shiftIds = [];
    for (let id = 0; id < shiftIntervals.length; id++) {
        shiftIds.push(id);
    }
    shiftIds.sort((shiftA, shiftB) => {
        // how many employees available for this slot on this day?
        let numEmployeesForA = availability[dayId][shiftA];
        let numEmployeesForB = availability[dayId][shiftB];
        return numEmployeesForA - numEmployeesForB;
    })
    return shiftIds;
}

function assignEmployee(dayId, shiftId) {
    // get the available workers for this (dayId, shiftId)
    // put through min-heap
    // assign if candidate satisfies
    // return the worker id
    let assignedEmployeeId = -1;
    const availableEmployeeIds = availability[dayId][shiftId];
    const pq = new MinHeap(employeeComparable);
    for (const EmployeeId of availableEmployeeIds) {
        pq.offer(employees[EmployeeId]);
    }

    while (!pq.isEmpty() && assignedEmployeeId == -1) {
        const candidate = pq.poll();
        if (canAssign(candidate, dayId, shiftId)) {
            assignedEmployeeId = candidate.id;
        }
    }
    return assignedEmployeeId;
}

function canAssign(employee, dayId, shiftId) {
    const amount = shiftIntervals[shiftId][1] - shiftIntervals[shiftId][0];
    return schedule[employee.id][dayId] === -1 &&
        employee.workload + amount <= maxWorkload;
}

function employeeComparable(one, other) {
    return one.workload - other.workload;
}

function insertCoveredInterval(dayId, shiftId) {
    const currIntervals = coveredIntervals[dayId];
    const newInterval = [shiftIntervals[shiftId][0], shiftIntervals[shiftId][1]];

    const merged = [];

    const n = currIntervals.length;
    let i = 0;

    // intervals end before
    while (i < n && currIntervals[i][1] < newInterval[0]) {
        merged.push([currIntervals[i][0], currIntervals[i][1]]);
        i++;
    }

    // overlapped intervals
    while (i < n && currIntervals[i][0] <= newInterval[1]) {
        // merge 2 intervals
        newInterval[0] = Math.min(newInterval[0], currIntervals[i][0]);
        newInterval[1] = Math.max(newInterval[1], currIntervals[i][1]);
        i++;
    }
    merged.push(newInterval);

    // intervals start after
    while (i < n) {
        merged.push([currIntervals[i][0], currIntervals[i][1]]);
        i++;
    }
    coveredIntervals[dayId] = merged;
}


function initializeSchedule() {
    // table m x n (m = num employees, n = num days) schedule[employeeId][dayId] = the shift worker assigned to on the given day
    const m = numEmployees;
    const n = numDays;

    schedule = [];
    for (let employeeId = 0; employeeId < m; employeeId++) {
        schedule.push([]);
        for (let dayId = 0; dayId < n; dayId++) {
            schedule[employeeId].push(-1);
        }
    }
}

function initializeCoveredIntervals() {
    coveredIntervals = [];
    for (let dayId = 0; dayId < numDays; dayId++) {
        coveredIntervals.push([]);
    }
}


function initializeEmployees() {
    employees = [];
    for (let employeeId = 0; employeeId < numEmployees; employeeId++) {
        employees.push(new Employee(employeeId));
    }
}

function isCovered(dayId, startTime, endTime) {
    // returns whether on the given day, from startTime to endTime has there been a worker assigned on duty?
    const covered = coveredIntervals[dayId];
    for (const interval of covered) {
        if (interval[0] <= startTime && endTime <= interval[1]) {
            return true;
        }
    }
    return false;
}


function initializeAvailability() {
    // create table m x n (m = num work days, n = num shift intervals). table[day][shift] gives list of employees available for this slot
    
    // initialize
    availability = [];
    const m = numDays;
    const n = shiftIntervals.length;


    for (let dayId = 0; dayId < m; dayId++) {
        availability.push([]);

        for (let shiftId = 0; shiftId < n; shiftId++) {
            availability[dayId].push([]);
        }
    }

    // fill in values

    for (let employeeId = 0; employeeId < numEmployees; employeeId++) { // r: index of employee
        for (let dayId = 0; dayId < numDays; dayId++) { // c: index of work day
            for (const shiftId of rows[employeeId][dayId]) {
                availability[dayId][shiftId].push(employeeId);
            }
            
        }
    }

}

function mergeIntervals(intervals) {
    // no modify to intervals input
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

function optimizeSchedule(dayId) {
    // remove unnessary shift assignments
    const assignedShiftIds = [];
    const map = {};


    // assigned shifts:
    for (let employeeId = 0; employeeId < numEmployees; employeeId++) {
        const shiftId = schedule[employeeId][dayId];
        if (shiftId != -1) {
            assignedShiftIds.push(shiftId);
            map[shiftId] = employeeId;
        }
    }

    assignedShiftIds.sort(); // make the shifts sorted by start time
    
    // get the intervals
    const allIntervals = [];
    for (const shiftId of assignedShiftIds) {
        allIntervals.push(shiftIntervals[shiftId]);
    }
    

    // merge all Intervals
    const currMerged = mergeIntervals(allIntervals);


    // simulate remove one shift if affects the covered interval?
    for (const removedShift of assignedShiftIds) {
        const newIntervals = [];
        for (const id of assignedShiftIds) {
            if (id != removedShift) {
                newIntervals.push(shiftIntervals[id]);
            }
        }

        // merge the new ones
        const newMerged = mergeIntervals(newIntervals);

        // check if currMerged == newMerge
        if (isSame(currMerged, newMerged)) {
            console.log(`Remove shift ${shiftIntervals[removedShift]} at day ${dayId}`);
            const employeeId = map[removedShift];
            schedule[employeeId][dayId] = -1;
            const startTime = shiftIntervals[removedShift][0];
            const endTime = shiftIntervals[removedShift][1];

            employees[employeeId].removeWorkload(endTime - startTime);
        }
    }
}

function isSame(intervals1, intervals2) {
    // both intervals are sorted by start time
    if (intervals1.length != intervals2.length) {
        return false;
    }
    for (let i = 0; i < intervals1.length; i++) {
        if (intervals1[i][0] != intervals2[i][0]) {
            return false;
        }
        if (intervals1[i][1] != intervals2[i][1]) {
            return false;
        }
    }
    return true;
}
