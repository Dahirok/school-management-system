/**
 * School Management System - Core Logic
 * Handles Routing, State Management, and UI Rendering
 * Cloud Sync enabled via Firebase Firestore
 */

const firebaseConfig = {
    apiKey: "AIzaSyCTp0l_AxKpbY-uVMUn6nSwNSuC-JjS1PY",
    authDomain: "boqolsoon-45432.firebaseapp.com",
    projectId: "boqolsoon-45432",
    storageBucket: "boqolsoon-45432.firebasestorage.app",
    messagingSenderId: "183149214952",
    appId: "1:183149214952:web:a5372a234a68aedfee1d5d",
    measurementId: "G-X1S36Y6QD4"
};

// --- MULTI-SCHOOL CONFIG ---
const Config = {
    schoolId: 'boqolsoon', // Unique ID for this application instance
    schoolName: 'Boqolsoon School'
};

// Initialize Firebase (Compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const Constants = {
    Classes: [
        'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
        'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8',
        'Form 1', 'Form 2', 'Form 3', 'Form 4'
    ],
    Subjects: {
        LowerPrimary: ['Tarbiyo', 'Seynis', 'C.B', 'Carabi', 'Somali', 'Xisaab', 'English'], // 1-4
        UpperPrimary: ['Tarbiyo', 'Seynis', 'C.B', 'Carabi', 'Somali', 'Xisaab', 'English', 'Technology'], // 5-8
        Secondary: ['Tarbiyo', 'Biology', 'Geography', 'Carabi', 'Somali', 'Xisaab', 'English', 'Physics', 'Business', 'Technology', 'Chemistry', 'History'] // F1-4
    },
    AcademicYears: ['2025-2026', '2024/2025', '2023/2024', '2022/2023'],

    // Normalize Class Name (e.g. "class 6" -> "Grade 6", " grade 6 " -> "Grade 6")
    normalizeClassName: (name) => {
        if (!name) return '';
        // 1. Convert to string, trim, and replace all types of whitespace (including non-breaking) with single space
        let normalized = name.toString().trim().replace(/[\s\xa0]+/g, ' ');

        // 2. Normalize "Class X" or "ClassX" to "Grade X"
        const classMatch = normalized.match(/^class\s*(\d+)$/i);
        if (classMatch) {
            return `Grade ${classMatch[1]}`;
        }

        // 3. Normalize "Grade X" or "GradeX" (handle case and extra spaces)
        const gradeMatch = normalized.match(/^grade\s*(\d+)$/i);
        if (gradeMatch) {
            return `Grade ${gradeMatch[1]}`;
        }

        // 4. Normalize "Form X" or "FormX"
        const formMatch = normalized.match(/^form\s*(\d+)$/i);
        if (formMatch) {
            return `Form ${formMatch[1]}`;
        }

        return normalized;
    },

    // Map class names to subject levels
    getSubjects: (className) => {
        if (!className) return [];
        const normalized = Constants.normalizeClassName(className);
        const lower = normalized.toLowerCase();

        // Lower Primary: Grade 1-4
        if (lower.includes('grade 1') || lower.includes('grade 2') || lower.includes('grade 3') || lower.includes('grade 4')) {
            return Constants.Subjects.LowerPrimary;
        }

        // Upper Primary: Grade 5-8
        if (lower.includes('grade 5') || lower.includes('grade 6') || lower.includes('grade 7') || lower.includes('grade 8')) {
            return Constants.Subjects.UpperPrimary;
        }

        return Constants.Subjects.Secondary;
    },
    Terms: {
        'Term 1': { max: 10, pass: 5 },
        'Term 2': { max: 30, pass: 15 },
        'Term 3': { max: 10, pass: 5 },
        'Term 4': { max: 50, pass: 25 }
    }
};

// --- STATE MANAGEMENT (Firebase Firestore with Local Cache) ---
const Store = {
    cache: {
        students: [],
        marks: [],
        staff: [],
        messages: [],
        classes: [],
        subjects: [],
        editingStudentId: null,
        editingStaffId: null,
        currentYear: '2025-2026',
        settings: [],
        colVis: {
            regNo: true,
            name: true,
            motherName: false, // Hidden by default as per common standard
            sex: true,
            total: true,
            avg: true
        }
    },

    get: (key) => Store.cache[key] || [],

    // Sync specific collection
    sync: (key) => {
        const targetId = Config.schoolId.toLowerCase().trim();
        // We listen to the whole collection but filter locally to handle potential casing/spacing issues in DB
        db.collection(key).onSnapshot(snapshot => {
            const data = [];
            let skippedCount = 0;

            snapshot.forEach(doc => {
                const item = doc.data();
                const itemSchoolId = (item.schoolId || '').toString().toLowerCase().trim();

                if (itemSchoolId === targetId) {
                    data.push({ id: doc.id, ...item });
                } else {
                    skippedCount++;
                }
            });

            Store.cache[key] = data;
            console.log(`[Sync] ${key}: ${data.length} items loaded. (${skippedCount} items skipped for other schools)`);

            if (Router.current && Render[Router.current]) {
                Render[Router.current](Router.currentParam);
            }
            Render.dashboard();
        }, error => {
            console.error(`Firebase Sync Error (${key}):`, error);
        });
    },

    // Initialize Syncing & Migration
    init: async () => {
        // Start Syncing for all collections
        ['students', 'marks', 'staff', 'messages', 'classes', 'subjects', 'settings'].forEach(key => Store.sync(key));

        // Migration from LocalStorage (One-time)
        const migrated = localStorage.getItem('sms_migrated');
        if (!migrated) {
            console.log("Starting migration to Cloud...");
            const localStudents = JSON.parse(localStorage.getItem('sms_students')) || [];
            if (localStudents.length > 0) {
                for (const s of localStudents) {
                    const id = s.id ? s.id.toString() : Date.now().toString();
                    await db.collection('students').doc(id).set(s);
                }
            }
            localStorage.setItem('sms_migrated', 'true');
        }
    }
};

// --- ROUTER ---
const Router = {
    routes: ['dashboard', 'students', 'student-profile', 'academics', 'staff', 'inbox', 'reports', 'exams'],
    current: 'dashboard',
    currentParam: null,

    navigate: (page, param = null) => {
        Router.current = page;
        Router.currentParam = param;

        // Handle Sidebar active state
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navItem = document.getElementById(`nav-${page}`);
        if (navItem) navItem.classList.add('active');

        // Handle Toolbar active state
        document.querySelectorAll('.toolbar-item').forEach(el => el.classList.remove('active'));
        const toolbarItem = document.getElementById(`tb-${page}`);
        if (toolbarItem) toolbarItem.classList.add('active');

        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

        // Show current view
        const view = document.getElementById(`view-${page}`);
        if (view) {
            view.classList.remove('hidden');
            view.classList.add('fade-in');
        }

        // Render dynamic content
        if (Render[page]) Render[page](param);
    }
};

// --- RENDERING LOGIC ---
const Render = {
    dashboard: async () => {
        const user = Auth.user || { name: 'Guest', role: 'teacher' };
        document.getElementById('dash-teacher-name').innerText = user.name;
        document.getElementById('dash-date').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Profile Data
        const isAdmin = user.role === 'head_teacher' || user.role === 'administrator';
        document.getElementById('dash-profile-name').innerText = user.name;
        document.getElementById('dash-profile-role').innerText = isAdmin ? (user.role === 'administrator' ? 'Administrator' : 'Head Teacher') : 'Class Teacher';

        const assignedSubjects = user.assignedSubjects || [];
        document.getElementById('dash-subject').innerText = assignedSubjects.length > 0 ? assignedSubjects.join(', ') : (isAdmin ? 'All Subjects' : 'None');

        // Determine Class (Simple heuristic: find class with most students carrying this teacher's subject, or just "All" for Head)
        // For simplicity/MVP:
        document.getElementById('dash-class').innerText = isAdmin ? 'All Classes' : 'Assigned Classes';

        // --- STATS CALCULATION ---
        const students = Store.get('students');
        const marks = Store.get('marks').filter(m => m.year === Store.cache.currentYear);

        // Debug: Log total items synced to help troubleshoot discrepancies
        console.log(`[Dashboard] Calculating stats for ${students.length} students and ${marks.length} marks.`);

        let totalStudents = students.length;
        let passCount = 0;
        let failCount = 0;
        let totalScoreSum = 0;
        let totalMaxSum = 0;
        let alerts = [];

        // Constants helpers
        const terms = ['Term 1', 'Term 2', 'Term 3', 'Term 4'];

        students.forEach(s => {
            // Check Annual Status
            // STRICT LOGIC (Matches Online): Fail if ANY subject in ANY term is below pass threshold.
            let hasFail = false;
            let hasData = false;
            let studentTotal = 0;
            let studentMax = 0;
            let termFailures = [];

            terms.forEach(term => {
                const config = Constants.Terms[term];
                const termMarks = marks.filter(m => m.studentId == s.id && m.term === term && !isNaN(parseFloat(m.score)));

                if (termMarks.length > 0) {
                    hasData = true;
                    const sum = termMarks.reduce((a, b) => a + parseFloat(b.score), 0);
                    const avg = sum / termMarks.length;

                    studentTotal += avg;
                    studentMax += config.max;

                    // Stricter check: Fail if average is low OR if any individual subject in this term is below threshold
                    const anySubjectFail = termMarks.some(m => parseFloat(m.score) < config.pass);

                    if (avg < config.pass || anySubjectFail) {
                        hasFail = true;
                        if (!termFailures.includes(term)) termFailures.push(term);
                    }
                }
            });

            if (hasFail) {
                failCount++;
                if (termFailures.length > 0) {
                    alerts.push({ name: s.name, issue: `Failed ${termFailures.join(', ')}`, id: s.id });
                }
            } else if (hasData) {
                // Passed only if they have data AND no failures
                passCount++;
            }

            if (studentMax > 0) {
                totalScoreSum += studentTotal;
                totalMaxSum += studentMax;
            }
        });

        // Update UI
        document.getElementById('dash-total-students').innerText = totalStudents;
        document.getElementById('dash-passed').innerText = passCount;
        document.getElementById('dash-failed').innerText = failCount;

        const globalAvg = totalMaxSum > 0 ? (totalScoreSum / totalMaxSum) * 100 : 0;
        document.getElementById('dash-avg-score').innerText = Math.round(globalAvg) + '%';

        // Alerts Table
        const alertsBody = document.getElementById('dash-alerts-body');
        document.getElementById('dash-alert-count').innerText = `${alerts.length} Issues`;

        if (alerts.length === 0) {
            alertsBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#95a5a6;">✅ All students performing well!</td></tr>`;
        } else {
            alertsBody.innerHTML = alerts.slice(0, 5).map(a => `
                <tr>
                    <td style="font-weight:500;">${a.name}</td>
                    <td style="color:#e74c3c;">${a.issue}</td>
                    <td style="text-align:right;">
                        <button class="btn-sm" onclick="Router.navigate('student-profile', ${a.id})">Review</button>
                    </td>
                </tr>
            `).join('');
            if (alerts.length > 5) {
                alertsBody.innerHTML += `<tr><td colspan="3" style="text-align:center; font-size:0.8rem; color:#64748b;">+${alerts.length - 5} more issues...</td></tr>`;
            }
        }
    },

    students: () => {
        const students = Store.get('students');
        const groups = Store.get('settings');
        const releaseDoc = groups.find(d => d.id === 'exam_release');
        const isReleasedGlobal = releaseDoc ? (releaseDoc.released === true || releaseDoc.released === 'true') : false;

        const tbody = document.getElementById('students-table-body');
        const isHead = Auth.user && (Auth.user.role === 'head_teacher' || Auth.user.role === 'administrator');

        tbody.innerHTML = students.map(s => `
            <tr>
                <td><input type="checkbox" class="student-checkbox" data-id="${s.id}" onchange="Actions.updateDeleteButton()"></td>
                <td>S${s.regNumber || s.id}</td>
                <td class="font-bold text-primary">${s.name}</td>
                <td>${s.className || s.grade}</td>
                <td>${s.guardianName || s.parent}</td>
                <td>${s.guardianPhone || '-'}</td>
                <td><span class="badge ${s.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${s.status}</span></td>
                <td>
                    ${(() => {
                const indVal = s.examsReleased;
                const individualIsSet = indVal !== undefined && indVal !== null && indVal !== '';
                const individualReleased = individualIsSet ? (indVal === true || indVal === 'true') : null;
                const isReleasedEffective = (individualReleased !== null) ? individualReleased : isReleasedGlobal;

                const badgeClass = individualReleased !== null
                    ? (individualReleased ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800')
                    : (isReleasedGlobal ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800');

                const statusLabel = individualReleased !== null
                    ? (individualReleased ? '👁️ Released (Manual)' : '🙈 Locked (Manual)')
                    : (isReleasedGlobal ? '👁️ Released (School)' : '🙈 Locked (School)');

                return `
                            <span class="badge ${badgeClass}" 
                                  style="cursor:pointer; font-size: 0.7rem;" 
                                  onclick="Actions.toggleStudentExams('${s.id}', ${isReleasedEffective})"
                                  title="${individualIsSet ? 'Click to Toggle Override' : 'Click to Set Manual Override'}">
                                ${statusLabel}
                            </span>
                        `;
            })()}
                </td>
                <td>
                    <button class="btn-sm" onclick="Router.navigate('student-profile', '${s.id}')" title="View Details">👁️</button>
                    ${isHead ? `
                    <button class="btn-sm" onclick="Actions.editStudent('${s.id}')" title="Edit">✏️</button>
                    <button class="btn-sm text-danger" onclick="Actions.deleteStudent('${s.id}')" title="Delete">🗑️</button>
                    ` : ''}
                </td>
            </tr>
        `).join('');

        // Show Actions header for all
        const thActions = document.getElementById('th-student-actions');
        if (thActions) thActions.style.display = '';

        // Populate class filter with unique classes from student data
        const classFilter = document.getElementById('class-filter');
        if (classFilter) {
            // Get unique class names from students
            const uniqueClasses = [...new Set(students.map(s => s.className || s.grade).filter(c => c))];
            uniqueClasses.sort();

            const currentValue = classFilter.value;
            classFilter.innerHTML = '<option value="">All Classes</option>' +
                uniqueClasses.map(cls => `<option value="${cls}">${cls}</option>`).join('');

            // Restore previous selection if it still exists
            if (currentValue && uniqueClasses.includes(currentValue)) {
                classFilter.value = currentValue;
            }
        }
    },

    'student-profile': async (id) => {
        const students = Store.get('students');
        const s = students.find(student => student.id == id);
        if (!s) return Router.navigate('students');

        // Fetch Release Status
        const settings = Store.get('settings');
        const releaseDoc = settings.find(d => d.id === 'exam_release');
        const isReleasedGlobal = releaseDoc ? (releaseDoc.released === true || releaseDoc.released === 'true') : false;

        // Calculate Multi-Term Ranks in Class
        const allInClass = students.filter(student => student.className === s.className);
        const marks_all = Store.get('marks').filter(m => m.year === Store.cache.currentYear);
        const termsList = ['Term 1', 'Term 2', 'Term 3', 'Term 4'];
        const termRanks = {};

        termsList.forEach(term => {
            const list = allInClass.map(student => {
                const studentMarks = marks_all.filter(m => m.studentId == student.id && m.term === term);
                const total = studentMarks.reduce((acc, m) => acc + parseFloat(m.score || 0), 0);
                const hasData = studentMarks.length > 0;
                return { id: student.id, total, hasData };
            });
            list.sort((a, b) => b.total - a.total);
            const rank = list.findIndex(r => r.id === s.id) + 1;
            const hasData = list.find(r => r.id === s.id)?.hasData;
            termRanks[term] = hasData ? rank : '-';
        });

        // Annual Rank
        const annualList = allInClass.map(student => {
            const studentMarks = marks_all.filter(m => m.studentId == student.id);
            const total = studentMarks.reduce((acc, m) => acc + parseFloat(m.score || 0), 0);
            return { id: student.id, total };
        });
        annualList.sort((a, b) => b.total - a.total);
        const myAnnualRank = annualList.findIndex(r => r.id === s.id) + 1;
        const totalClass = allInClass.length;

        // Use uploaded photo or fallback avatar
        const photoUrl = s.photo || `https://ui-avatars.com/api/?name=${s.name}&background=random&size=150`;

        const container = document.getElementById('student-profile-content');
        container.innerHTML = `
            <div class="no-print" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h2 class="page-title">Student Profile</h2>
                <div style="display:flex; gap:1rem;">
                    <button class="btn btn-primary" onclick="window.print()">🖨️ Print to A4</button>
                    ${Auth.user && Auth.user.role === 'student' ? `<button class="btn" onclick="Auth.logout()" style="background:#e74c3c; color:white;">Logout</button>` : `<button class="btn" onclick="Router.navigate('students')">← Back to List</button>`}
                </div>
            </div>
            
            <div class="a4-page" id="printable-area">
                <!-- Report Header -->
                <div style="border-bottom: 3px solid #34495e; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="logo.png" style="width: 80px; height: 80px; object-fit: contain;" onerror="this.style.display='none'">
                        <div>
                            <h1 style="margin: 0; font-size: 24px; color: #2c3e50; text-transform: uppercase; letter-spacing: 1px;">${Config.schoolName}</h1>
                            <p style="margin: 2px 0 0 0; font-size: 14px; color: #7f8c8d;">Excellence in Education</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0; font-size: 18px; color: #34495e;">Student Record</h2>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #95a5a6;">Date: ${new Date().toLocaleDateString()}</p>
                    </div>
                </div>

                <!-- Student Header Info -->
                <div style="display: flex; gap: 2rem; margin-bottom: 2rem;">
                    <div style="width: 120px; height: 120px; flex-shrink: 0; border: 2px solid #ecf0f1; border-radius: 8px; overflow: hidden;">
                        <img src="${photoUrl}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div style="flex: 1;">
                        <h1 style="margin: 0 0 10px 0; font-size: 28px; color: #2c3e50;">${s.name}</h1>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 14px;">
                            <div><strong style="color: #7f8c8d;">Reg Number:</strong> <span style="font-size: 16px; font-weight: bold;">${s.regNumber}</span></div>
                            <div><strong style="color: #7f8c8d;">Current Class:</strong> <span style="font-size: 16px; font-weight: bold;">${s.className}</span></div>
                            <div><strong style="color: #7f8c8d;">Status:</strong> <span style="display: inline-block; padding: 2px 8px; background: #e0f2f1; color: #00695c; border-radius: 4px; font-size: 12px;">${s.status}</span></div>
                            <div><strong style="color: #7f8c8d;">Class Rank:</strong> <span style="font-size: 16px; font-weight: bold; color: #e67e22;">${myAnnualRank}</span></div>
                        </div>
                    </div>
                </div>

                <!-- Info Grid -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3rem;">
                    <div>
                        <h3 style="border-bottom: 2px solid #3498db; padding-bottom: 8px; margin-bottom: 15px; color: #2980b9; font-size: 16px; text-transform: uppercase;">Personal Information</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Gender</td><td style="padding: 8px 0; font-weight: 500;">${s.sex || '-'}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Mother's Name</td><td style="padding: 8px 0; font-weight: 500;">${s.motherName || '-'}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Date of Birth</td><td style="padding: 8px 0; font-weight: 500;">${s.dob || '-'}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Place of Birth</td><td style="padding: 8px 0; font-weight: 500;">${s.birthPlace || '-'}</td></tr>
                            <tr><td style="padding: 8px 0; color: #7f8c8d;">Nationality</td><td style="padding: 8px 0; font-weight: 500;">${s.nationality || 'Somali'}</td></tr>
                        </table>
                    </div>

                    <div>
                        <h3 style="border-bottom: 2px solid #1abc9c; padding-bottom: 8px; margin-bottom: 15px; color: #16a085; font-size: 16px; text-transform: uppercase;">Contact & Guardian</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Guardian Name</td><td style="padding: 8px 0; font-weight: 500;">${s.guardianName || '-'}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Guardian Phone</td><td style="padding: 8px 0; font-weight: 500;">${s.guardianPhone || '-'}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Student Phone</td><td style="padding: 8px 0; font-weight: 500;">${s.phone || '-'}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 8px 0; color: #7f8c8d;">Region</td><td style="padding: 8px 0; font-weight: 500;">${s.region || '-'}</td></tr>
                            <tr><td style="padding: 8px 0; color: #7f8c8d;">Village/District</td><td style="padding: 8px 0; font-weight: 500;">${s.village || '-'}, ${s.district || '-'}</td></tr>
                        </table>
                    </div>
            </div>

            <!-- Academic Report (Marks) -->
            <div style="margin-top: 3rem; margin-bottom: 2rem;">
                ${(() => {
                const isHeadOrTeacher = Auth.user && (Auth.user.role === 'head_teacher' || Auth.user.role === 'administrator' || Auth.user.role === 'teacher' || Auth.user.role === 'Teacher');

                // Safe boolean check for individual student setting
                const indVal = s.examsReleased;
                const individualIsSet = indVal !== undefined && indVal !== null && indVal !== '';
                const individualReleased = individualIsSet ? (indVal === true || indVal === 'true') : null;

                // Final release logic: Individual preference wins, else global
                const isReleased = (individualReleased !== null) ? individualReleased : isReleasedGlobal;

                if (!isReleased && !isHeadOrTeacher) {
                    return `
                            <div style="padding: 3rem; text-align: center; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; margin-top: 2rem;">
                                <div style="font-size: 3rem; margin-bottom: 1rem;">🙈</div>
                                <h3 style="color: #475569; margin-bottom: 0.5rem;">Results Not Released</h3>
                                <p style="color: #64748b; max-width: 400px; margin: 0 auto;">Your exam results for this term are currently being processed and have not been released yet. Please check back later or contact your class teacher.</p>
                            </div>
                        `;
                }

                return `
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8e44ad; padding-bottom: 8px; margin-bottom: 15px;">
                            <h3 style="margin: 0; color: #8e44ad; font-size: 16px; text-transform: uppercase;">
                                Academic Report (${Store.cache.currentYear}) - Annual Assessment
                            </h3>
                            ${isHeadOrTeacher && !isReleased ? `<span style="font-size: 0.8rem; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-weight: bold;">⚠️ Hidden from Student</span>` : ''}
                            ${isHeadOrTeacher && isReleased ? `<span style="font-size: 0.8rem; background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: bold;">✅ Released to Student</span>` : ''}
                        </div>
                        
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid #e2e8f0;">
                            <thead>
                                <tr style="background-color: #f8fafc; color: #34495e;">
                                    <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Subject</th>
                                    <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; width: 80px;">
                                        Term 1 <br><span style="font-size:0.8rem; color:#64748b;">(10)</span>
                                    </th>
                                    <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; width: 80px;">
                                        Term 2 <br><span style="font-size:0.8rem; color:#64748b;">(30)</span>
                                    </th>
                                    <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; width: 80px;">
                                        Term 3 <br><span style="font-size:0.8rem; color:#64748b;">(10)</span>
                                    </th>
                                    <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; width: 80px;">
                                        Term 4 <br><span style="font-size:0.8rem; color:#64748b;">(50)</span>
                                    </th>
                                    <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; width: 80px; background-color: #f1f5f9;">
                                        Total <br><span style="font-size:0.8rem; color:#64748b;">(100)</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(() => {
                        const marks = Store.get('marks').filter(m => m.studentId == s.id && m.year === Store.cache.currentYear);

                        // Determine Level and Subjects
                        let subjects = [];
                        const lower = s.className.toLowerCase();
                        const dynamicSubjects = Store.get('subjects');
                        let level = 'Secondary';

                        if (lower.includes('grade 1') || lower.includes('grade 2') || lower.includes('grade 3') || lower.includes('grade 4') || lower.includes('class 1') || lower.includes('class 2') || lower.includes('class 3') || lower.includes('class 4')) {
                            level = 'LowerPrimary';
                        } else if (lower.includes('grade 5') || lower.includes('grade 6') || lower.includes('grade 7') || lower.includes('grade 8') || lower.includes('class 5') || lower.includes('class 6') || lower.includes('class 7') || lower.includes('class 8')) {
                            level = 'UpperPrimary';
                        }

                        subjects = dynamicSubjects.filter(sub => sub.level === level).map(sub => sub.name);
                        if (subjects.length === 0) subjects = Constants.getSubjects(s.className);

                        if (subjects.length === 0) return '<tr><td colspan="7" style="text-align:center; padding:15px; color:#95a5a6;">No subjects assigned for this class.</td></tr>';

                        // Accumulators for Footer
                        let t1Sum = 0, t2Sum = 0, t3Sum = 0, t4Sum = 0, totalSum = 0;
                        let t1Count = 0, t2Count = 0, t3Count = 0, t4Count = 0;

                        const rowsHtml = subjects.map(sub => {
                            const getScore = (t) => {
                                const m = marks.find(rec => rec.subject === sub && rec.term === t);
                                return m ? parseFloat(m.score) : NaN;
                            };

                            const s1 = getScore('Term 1');
                            const s2 = getScore('Term 2');
                            const s3 = getScore('Term 3');
                            const s4 = getScore('Term 4');

                            // Accumulate valid scores
                            if (!isNaN(s1)) { t1Sum += s1; t1Count++; }
                            if (!isNaN(s2)) { t2Sum += s2; t2Count++; }
                            if (!isNaN(s3)) { t3Sum += s3; t3Count++; }
                            if (!isNaN(s4)) { t4Sum += s4; t4Count++; }

                            let rowTotal = 0;
                            if (!isNaN(s1)) rowTotal += s1;
                            if (!isNaN(s2)) rowTotal += s2;
                            if (!isNaN(s3)) rowTotal += s3;
                            if (!isNaN(s4)) rowTotal += s4;
                            totalSum += rowTotal;

                            // Display strings & Colors (Red if < 50% max)
                            const d1 = !isNaN(s1) ? s1 : '-';
                            const c1 = !isNaN(s1) && s1 < Constants.Terms['Term 1'].pass ? '#e74c3c' : '#64748b';

                            const d2 = !isNaN(s2) ? s2 : '-';
                            const c2 = !isNaN(s2) && s2 < Constants.Terms['Term 2'].pass ? '#e74c3c' : '#64748b';

                            const d3 = !isNaN(s3) ? s3 : '-';
                            const c3 = !isNaN(s3) && s3 < Constants.Terms['Term 3'].pass ? '#e74c3c' : '#64748b';

                            const d4 = !isNaN(s4) ? s4 : '-';
                            const c4 = !isNaN(s4) && s4 < Constants.Terms['Term 4'].pass ? '#e74c3c' : '#64748b';

                            return `
                                                <tr>
                                                    <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 500;">${sub}</td>
                                                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: ${c1}; font-weight:${c1 === '#e74c3c' ? 'bold' : 'normal'};">${d1}</td>
                                                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: ${c2}; font-weight:${c2 === '#e74c3c' ? 'bold' : 'normal'};">${d2}</td>
                                                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: ${c3}; font-weight:${c3 === '#e74c3c' ? 'bold' : 'normal'};">${d3}</td>
                                                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: ${c4}; font-weight:${c4 === '#e74c3c' ? 'bold' : 'normal'};">${d4}</td>
                                                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; background-color: #f8fafc;">${rowTotal}</td>
                                                </tr>
                                            `;
                        }).join('');

                        // --- Status Calculation (Footer Logic) ---
                        const getTermStatus = (sum, count, termName) => {
                            if (count === 0) return { text: '-', color: '#95a5a6', status: 'Pending' };
                            const avg = sum / count;
                            const passMark = Constants.Terms[termName].pass;
                            const passed = avg >= passMark;
                            return {
                                text: passed ? 'Pass' : 'Fail',
                                color: passed ? '#27ae60' : '#e74c3c',
                                status: passed ? 'Pass' : 'Fail'
                            };
                        };

                        const st1 = getTermStatus(t1Sum, t1Count, 'Term 1');
                        const st2 = getTermStatus(t2Sum, t2Count, 'Term 2');
                        const st3 = getTermStatus(t3Sum, t3Count, 'Term 3');
                        const st4 = getTermStatus(t4Sum, t4Count, 'Term 4');

                        const terms = [st1, st2, st3, st4];
                        const anyFail = terms.some(t => t.status === 'Fail');
                        const annualStatus = anyFail ? 'FAIL' : 'PASS';
                        const annualColor = anyFail ? '#e74c3c' : '#27ae60';

                        const footerHtml = `
                                            <tfoot>
                                                <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
                                                    <td style="padding: 10px; font-weight: bold; text-align: right;">Average:</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold;">${t1Count ? (t1Sum / t1Count).toFixed(1) : '-'}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold;">${t2Count ? (t2Sum / t2Count).toFixed(1) : '-'}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold;">${t3Count ? (t3Sum / t3Count).toFixed(1) : '-'}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold;">${t4Count ? (t4Sum / t4Count).toFixed(1) : '-'}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; background-color: #e2e8f0;">${subjects.length ? (totalSum / subjects.length).toFixed(1) : '-'}</td>
                                                </tr>
                                                <tr style="background-color: #fff;">
                                                    <td style="padding: 10px; font-weight: bold; text-align: right;">Term Rank:</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color: #e67e22;">${termRanks['Term 1']}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color: #e67e22;">${termRanks['Term 2']}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color: #e67e22;">${termRanks['Term 3']}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color: #e67e22;">${termRanks['Term 4']}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color: #e67e22; background-color: #fffbeb; border: 1px solid #fde68a;">${myAnnualRank}</td>
                                                </tr>
                                                <tr style="background-color: #f8fafc;">
                                                    <td style="padding: 10px; font-weight: bold; text-align: right;">Term Status:</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color:${st1.color};">${st1.text}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color:${st2.color};">${st2.text}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color:${st3.color};">${st3.text}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:bold; color:${st4.color};">${st4.text}</td>
                                                    <td style="padding: 10px; text-align: center; font-weight:900; color:${annualColor}; border:2px solid ${annualColor};">
                                                        ${annualStatus}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        `;

                        return rowsHtml + '</tbody>' + footerHtml;

                    })()}
                            </table>
                        `;
            })()}
            </div>

                <!-- Footer -->
                <div style="position: absolute; bottom: 20mm; left: 20mm; right: 20mm; text-align: center; border-top: 1px solid #bdc3c7; padding-top: 10px;">
                    <p style="font-size: 12px; color: #95a5a6; margin: 0;">System Generated Report • ${Config.schoolName} Management System</p>
                    <p style="font-size: 12px; color: #95a5a6; margin: 2px 0 0 0;">This document is valid without a signature.</p>
                </div>
            </div>
        `;
    },

    academics: () => {
        const classes = Store.get('classes');
        const subjects = Store.get('subjects');
        const grid = document.getElementById('academics-levels-grid');
        if (!grid) return;

        const levels = [
            { id: 'LowerPrimary', name: 'Lower Primary (G1-4)', color: '#3498db' },
            { id: 'UpperPrimary', name: 'Upper Primary (G5-8)', color: '#1abc9c' },
            { id: 'Secondary', name: 'Secondary (F1-4)', color: '#8e44ad' }
        ];

        grid.innerHTML = levels.map(lv => {
            const levelClasses = classes.filter(c => c.level === lv.id);
            const levelSubjects = subjects.filter(s => s.level === lv.id);

            return `
                <div class="card" style="border-top: 4px solid ${lv.color};">
                    <h3 style="margin-bottom:1rem; color:${lv.color};">${lv.name}</h3>
                    
                    <div style="margin-bottom:1.5rem;">
                        <h4 style="font-size:0.9rem; margin-bottom:0.5rem; color:#64748b;">Classes</h4>
                        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                            ${levelClasses.map(c => `
                                <div class="badge" style="display:flex; align-items:center; gap:5px; background:#f1f5f9; color:#334155;">
                                    ${c.name}
                                    <span style="cursor:pointer; font-weight:bold; color:#94a3b8;" onclick="Actions.deleteClass('${c.id}')">&times;</span>
                                </div>
                            `).join('') || '<span class="text-muted" style="font-size:0.8rem;">No classes</span>'}
                        </div>
                    </div>

                    <div>
                        <h4 style="font-size:0.9rem; margin-bottom:0.5rem; color:#64748b;">Subjects</h4>
                        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                            ${levelSubjects.map(s => `
                                <div class="badge" style="display:flex; align-items:center; gap:5px; background:#e0f2fe; color:#0369a1;">
                                    ${s.name}
                                    <span style="cursor:pointer; font-weight:bold; color:#7dd3fc;" onclick="Actions.deleteSubject('${s.id}')">&times;</span>
                                </div>
                            `).join('') || '<span class="text-muted" style="font-size:0.8rem;">No subjects</span>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    staff: () => {
        const staff = Store.get('staff');
        const tbody = document.getElementById('staff-table-body');

        // Reset Level Checkboxes
        const form = document.getElementById('add-staff-form');
        if (form) {
            form.querySelectorAll('input[name=\"level\"]').forEach(cb => cb.checked = false);
        }

        // Reset Subject Container
        const subjectsContainer = document.getElementById('staff-subjects-container');
        if (subjectsContainer) subjectsContainer.innerHTML = '<p class="text-muted" style="font-size: 0.9rem;">-- Select Level First --</p>';

        if (tbody) {
            const isHead = Auth.user && (Auth.user.role === 'head_teacher' || Auth.user.role === 'administrator');
            tbody.innerHTML = staff.map(t => `
                <tr>
                    <td>T${t.id}</td>
                    <td class="font-bold text-primary">${t.name}</td>
                    <td>${t.role}</td>
                    <td>${t.phone}</td>
                    <td>${t.subject || '-'}</td>
                    <td>
                        ${isHead ? `
                        <button class="btn-sm" onclick="Actions.editStaff(${t.id})" title="Edit">✏️</button>
                        <button class="btn-sm text-danger" onclick="Actions.deleteStaff(${t.id})" title="Delete">🗑️</button>
                        ` : '-'}
                    </td>
                </tr>
            `).join('');
        }
    },

    updateStaffSubjects: () => {
        const levelCheckboxes = document.querySelectorAll('input[name="level"]:checked');
        const selectedLevels = Array.from(levelCheckboxes).map(cb => cb.value);
        const subjectsContainer = document.getElementById('staff-subjects-container');

        if (selectedLevels.length === 0) {
            subjectsContainer.innerHTML = '<p class="text-muted" style="font-size: 0.9rem;">-- Select at least one Level --</p>';
            return;
        }

        // Get all subjects from selected levels
        const allSubjects = Store.get('subjects');
        let levelSubjects = [];
        selectedLevels.forEach(level => {
            const subs = allSubjects.filter(s => s.level === level).map(s => s.name);
            if (subs.length > 0) {
                levelSubjects = [...levelSubjects, ...subs];
            } else {
                // Fallback to constants
                levelSubjects = [...levelSubjects, ...Constants.Subjects[level]];
            }
        });

        // Remove duplicates
        levelSubjects = [...new Set(levelSubjects)];

        subjectsContainer.innerHTML = levelSubjects.map(s => `
            <label class="checkbox-item">
                <input type="checkbox" name="subject" value="${s}"> ${s}
            </label>
        `).join('');
    },

    inbox: () => {
        const messages = Store.get('messages');
        const container = document.getElementById('inbox-container');
        container.innerHTML = messages.map(m => `
            <div class="card message-item ${!m.read ? 'unread' : ''}" onclick="Actions.readMessage(${m.id})">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${m.from}</strong>
                    <span class="text-muted small">${m.date}</span>
                </div>
                <div style="font-weight:500; margin-top:0.25rem;">${m.subject}</div>
                <div class="text-muted" style="margin-top:0.5rem;">${m.body}</div>
            </div>
        `).join('');
    },

    reports: () => { },

    exams: () => {
        // Render Year Tabs
        const yearTabsContainer = document.getElementById('exam-year-tabs');
        if (yearTabsContainer) {
            yearTabsContainer.innerHTML = Constants.AcademicYears.map((year, idx) => `
                <button class="year-tab ${Store.cache.currentYear === year ? 'active' : ''}" 
                        onclick="Actions.switchExamYear('${year}')">
                    Exams: ${year} <span id="tab-count-${idx + 1}"></span>
                </button>
            `).join('') + `
                <button class="year-tab" style="background:var(--primary);">All Exams <span id="tab-count-all"></span></button>
            `;
        }

        // Populate Year Filter in Sidebar
        const yearFilterSidebar = document.getElementById('exam-year-filter-sidebar');
        if (yearFilterSidebar) {
            yearFilterSidebar.innerHTML = Constants.AcademicYears.map(year => `
                <div class="checkbox-item">
                    <input type="radio" name="sidebar-year" ${Store.cache.currentYear === year ? 'checked' : ''} 
                           onclick="Actions.switchExamYear('${year}')"> ${year}
                </div>
            `).join('');
        }

        // Populate Class Filter in Sidebar
        const classFilter = document.getElementById('exam-class-filter-sidebar');
        const termSelect = document.getElementById('exam-term-select');

        if (classFilter) {
            const currentClass = classFilter.value;
            const currentTerm = termSelect ? termSelect.value : 'Term 1';

            // Get unique classes from students (actual data)
            const students = Store.get('students');
            let uniqueClasses = [...new Set(students.map(s => s.className || s.grade).filter(c => c))];
            uniqueClasses.sort();

            // If no students yet, fall back to configured classes or constants
            let classList = uniqueClasses.length > 0 ? uniqueClasses :
                (Store.get('classes').length > 0 ? Store.get('classes').map(c => c.name) : Constants.Classes);

            // --- TEACHER RESTRICTION: Filter Classes by Assigned Level ---
            if (Auth.user && (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator') && Auth.user.assignedLevels && Auth.user.assignedLevels.length > 0) {
                const levels = Auth.user.assignedLevels;
                classList = classList.filter(cls => {
                    const l = cls.toLowerCase();
                    const isLower = l.includes('grade 1') || l.includes('grade 2') || l.includes('grade 3') || l.includes('grade 4') ||
                        l.includes('class 1') || l.includes('class 2') || l.includes('class 3') || l.includes('class 4');
                    const isUpper = l.includes('grade 5') || l.includes('grade 6') || l.includes('grade 7') || l.includes('grade 8') ||
                        l.includes('class 5') || l.includes('class 6') || l.includes('class 7') || l.includes('class 8');
                    const isSec = l.includes('form 1') || l.includes('form 2') || l.includes('form 3') || l.includes('form 4');

                    if (levels.includes('LowerPrimary') && isLower) return true;
                    if (levels.includes('UpperPrimary') && isUpper) return true;
                    if (levels.includes('Secondary') && isSec) return true;
                    return false;
                });
            }

            classFilter.innerHTML = '<option value="">All Classes</option>' +
                classList.map(c => `<option value="${c}">${c}</option>`).join('');

            // Restore Selection
            if (currentClass) classFilter.value = currentClass;
            if (termSelect && currentTerm) termSelect.value = currentTerm;

            classFilter.onchange = () => Render.examsEntry();
        }

        // --- EXAM LOCK & RELEASE CONTROLS (Head Teacher Only) ---
        const lockContainer = document.getElementById('exam-lock-container');
        if (lockContainer) {
            if (Auth.user && (Auth.user.role === 'head_teacher' || Auth.user.role === 'administrator')) {
                const settings = Store.get('settings');
                const lockDoc = settings.find(d => d.id === 'exam_lock');
                const releaseDoc = settings.find(d => d.id === 'exam_release');

                const isLocked = lockDoc ? lockDoc.locked : false;
                const isReleased = releaseDoc ? releaseDoc.released : false;

                lockContainer.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div class="filter-box" style="border: 2px solid ${isLocked ? '#e74c3c' : '#2ecc71'}; background: ${isLocked ? '#fdedec' : '#eafaf1'};">
                            <div class="filter-header" style="color:${isLocked ? '#c0392b' : '#27ae60'};">
                                ${isLocked ? '🔒 Exams Locked' : '🔓 Exams Open'}
                            </div>
                            <div class="filter-body">
                                <button class="btn btn-sm" style="width:100%; background:${isLocked ? '#2ecc71' : '#e74c3c'}; border:none;" 
                                    onclick="Actions.toggleExamLock()">
                                    ${isLocked ? 'Unlock Entry' : 'Lock Entry'}
                                </button>
                                <div style="font-size:0.75rem; margin-top:5px; color:#555;">
                                    ${isLocked ? 'Teachers cannot edit.' : 'Teachers can edit.'}
                                </div>
                            </div>
                        </div>

                        <div class="filter-box" style="border: 2px solid ${isReleased ? '#2ecc71' : '#f39c12'}; background: ${isReleased ? '#eafaf1' : '#fef9e7'};">
                            <div class="filter-header" style="color:${isReleased ? '#27ae60' : '#d35400'};">
                                ${isReleased ? '📢 Results Released' : '🙈 Results Hidden'}
                            </div>
                            <div class="filter-body">
                                <button class="btn btn-sm" style="width:100%; background:${isReleased ? '#f39c12' : '#2ecc71'}; border:none;" 
                                    onclick="Actions.toggleExamRelease()">
                                    ${isReleased ? 'Hide Results' : 'Release Results'}
                                </button>
                                <div style="font-size:0.75rem; margin-top:5px; color:#555;">
                                    ${isReleased ? 'Students can view.' : 'Students cannot view.'}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                lockContainer.innerHTML = '';
            }
        }

        Render.examsEntry();
        Render.updateExamSidebarStats();
    },

    updateExamSidebarStats: () => {
        const className = document.getElementById('exam-class-filter-sidebar')?.value || '';
        const students = Store.get('students').filter(s => !className || s.className === className);

        const femaleCount = students.filter(s => (s.sex || s.gender || '').toString().toLowerCase().startsWith('f')).length;
        const maleCount = students.filter(s => (s.sex || s.gender || '').toString().toLowerCase().startsWith('m')).length;

        const fEl = document.getElementById('count-female');
        const mEl = document.getElementById('count-male');
        if (fEl) fEl.innerText = `(${femaleCount})`;
        if (mEl) mEl.innerText = `(${maleCount})`;

        const tabAll = document.getElementById('tab-count-all');
        if (tabAll) tabAll.innerText = `(${students.length})`;

        Constants.AcademicYears.forEach((year, idx) => {
            const count = students.filter(s => (s.year === year || Store.cache.currentYear === year)).length;
            const tabEl = document.getElementById(`tab-count-${idx + 1}`);
            if (tabEl) tabEl.innerText = `(${count})`;
        });
    },

    examsEntry: async () => {
        const settings = Store.get('settings');
        const lockDoc = settings.find(d => d.id === 'exam_lock');
        const isLocked = lockDoc ? lockDoc.locked : false;
        const isHead = Auth.user && Auth.user.role === 'head_teacher';
        const readOnly = isLocked && !isHead;

        // Show Lock Warning
        const statusBanner = document.getElementById('exam-status-banner');
        if (statusBanner) {
            statusBanner.style.display = readOnly ? 'block' : 'none';
            if (readOnly) statusBanner.innerHTML = '<div style="background:#e74c3c; color:white; padding:10px; text-align:center; margin-bottom:10px; border-radius:4px;">🔒 <strong>Exams Locked:</strong> Marking period is closed. Contact Admin to edit.</div>';
        }
        const className = document.getElementById('exam-class-filter-sidebar')?.value || '';
        const term = document.getElementById('exam-term-select').value;
        const currentYear = Store.cache.currentYear;

        // Advanced Filters
        const searchVal = document.getElementById('exam-search-input')?.value.toLowerCase() || '';
        const regVal = document.getElementById('exam-reg-input')?.value.toLowerCase() || '';
        const femaleOnly = document.getElementById('filter-sex-female')?.checked;
        const maleOnly = document.getElementById('filter-sex-male')?.checked;

        const students = Store.get('students').filter(s => {
            const matchesClass = !className || s.className === className;
            const matchesSearch = !searchVal || s.name.toLowerCase().includes(searchVal);
            const matchesReg = !regVal || (s.regNumber || '').toString().toLowerCase().includes(regVal);

            let matchesSex = true;
            if (femaleOnly && !maleOnly) {
                const sexVal = (s.sex || s.gender || '').toString().toLowerCase();
                matchesSex = sexVal.startsWith('f');
            } else if (maleOnly && !femaleOnly) {
                const sexVal = (s.sex || s.gender || '').toString().toLowerCase();
                matchesSex = sexVal.startsWith('m');
            }

            return matchesClass && matchesSearch && matchesReg && matchesSex;
        });
        const marks = Store.get('marks');

        // Dynamic Subjects Selection
        let subjects = [];
        const dynamicSubjects = Store.get('subjects');
        if (className) {
            // Determine level from class name if dynamic subjects exist
            const lower = className.toLowerCase();
            let level = 'Secondary';
            if (lower.includes('grade 1') || lower.includes('grade 2') || lower.includes('grade 3') || lower.includes('grade 4') ||
                lower.includes('class 1') || lower.includes('class 2') || lower.includes('class 3') || lower.includes('class 4')) {
                level = 'LowerPrimary';
            } else if (lower.includes('grade 5') || lower.includes('grade 6') || lower.includes('grade 7') || lower.includes('grade 8') ||
                lower.includes('class 5') || lower.includes('class 6') || lower.includes('class 7') || lower.includes('class 8')) {
                level = 'UpperPrimary';
            }

            subjects = dynamicSubjects.filter(s => s.level === level).map(s => s.name);
            // Fallback to Constants if no dynamic subjects for this level
            if (subjects.length === 0) subjects = Constants.getSubjects(className);
        } else {
            subjects = Constants.Subjects.LowerPrimary;
        }

        // --- TEACHER SUBJECT FILTERING ---
        // If 'teacher' role, STRICTLY filter subjects to only those assigned.
        // If assignedSubjects is missing, they see NOTHING.
        if (Auth.user && Auth.user.role === 'teacher') {
            const assigned = Auth.user.assignedSubjects || [];
            subjects = subjects.filter(s => assigned.includes(s));
        }

        const thead = document.getElementById('marks-table-header');
        const tbody = document.getElementById('marks-table-body');
        const title = document.getElementById('marks-sheet-title');

        title.innerText = `Master Mark Sheet: ${className || 'All Students'} | ${term} (${currentYear})`;

        const statsText = document.getElementById('exam-stats-text');
        if (statsText) statsText.innerText = `Found ${students.length} students`;

        // Dynamic Headers based on Standards Screenshot
        const colVis = Store.cache.colVis;

        // Constants for Marks
        const termConfig = Constants.Terms[term];
        const maxMarkDisplay = termConfig ? `<span style="font-size:0.7em; color:#666;">(${termConfig.max})</span>` : '';

        let headerHtml = `
            <th style="sticky; left:0; background:#f8fafc; z-index:2; width:40px;">🔍</th>
            <th style="sticky; left:40px; background:#f8fafc; z-index:2; width:40px;"><input type="checkbox" id="select-all-exams" onclick="Actions.toggleSelectAll(this)"></th>
        `;

        if (colVis.regNo) headerHtml += `<th style="width:80px;">Reg No</th>`;
        headerHtml += `<th style="text-align:center; width:50px; background:#fef3c7; color:#92400e; font-weight:700;">Rank</th>`;
        headerHtml += `<th style="padding:0.75rem; sticky; left:80px; background:#f8fafc; z-index:2; text-align:left;">Student Name</th>`;
        if (colVis.motherName) headerHtml += `<th>Mother Name</th>`;
        if (colVis.sex) headerHtml += `<th>Sex</th>`;
        subjects.forEach(sub => {
            const isVisible = colVis[sub] !== false; // Active by default
            if (isVisible) {
                headerHtml += `<th style="text-align:center;">${sub} <br/>${maxMarkDisplay}</th>`;
            }
        });

        if (colVis.total) headerHtml += `<th style="text-align:center; background:#f0f9ff; color:var(--primary);">Total</th>`;
        if (colVis.avg) headerHtml += `<th style="text-align:center; background:#fdf2f2; color:var(--danger);">Average</th>`;
        headerHtml += `
            <th style="padding:0.5rem; text-align:center; color:var(--primary); text-decoration:underline;">Discipline</th>
            <th style="padding:0.5rem; text-align:center; color:var(--primary); text-decoration:underline;">Attendance</th>
            <th style="padding:0.5rem; text-align:center; color:var(--primary); text-decoration:underline;">Comments</th>
        `;
        thead.innerHTML = `<tr>${headerHtml}</tr>`;

        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${subjects.length + 8}" style="text-align:center; padding:2rem; color:var(--text-muted);">
                No students found for filter.
            </td></tr>`;
            return;
        }

        const isAnnual = term === 'Annual';

        // Pre-calculate totals for sorting and ranking
        students.forEach(s => {
            let total = 0;
            subjects.forEach(sub => {
                if (isAnnual) {
                    // Sum T1, T2, T3, T4
                    ['Term 1', 'Term 2', 'Term 3', 'Term 4'].forEach(t => {
                        const rec = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === t && m.year === currentYear);
                        total += parseFloat(rec?.score || 0);
                    });
                } else {
                    const record = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === term && m.year === currentYear) || {};
                    total += parseFloat(record.score || 0);
                }
            });
            s._gridTotal = total;
        });

        // Calculate Totals and Ranks for consistent display
        const sortedForRank = [...students].sort((a, b) => b._gridTotal - a._gridTotal);
        students.forEach(s => {
            s._gridRank = sortedForRank.findIndex(r => r.id === s.id) + 1;
        });

        // Sort by Name (Stable sort) for ease of entry
        students.sort((a, b) => a.name.localeCompare(b.name));

        // Body Rows
        const rowsHtml = students.map((s, idx) => {
            const rank = s._gridRank;
            let rowTotal = s._gridTotal;
            let subCount = 0;
            const subjectCols = subjects.map(sub => {
                const isVisible = colVis[sub] !== false;
                if (!isVisible) return '';

                let score = '';
                if (isAnnual) {
                    let sum = 0;
                    ['Term 1', 'Term 2', 'Term 3', 'Term 4'].forEach(t => {
                        const rec = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === t && m.year === currentYear);
                        if (rec && rec.score !== '') {
                            sum += parseFloat(rec.score);
                            subCount++;
                        }
                    });
                    score = sum || '';
                } else {
                    const record = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === term && m.year === currentYear) || {};
                    score = (record.score !== undefined && record.score !== null) ? record.score : '';
                    if (score !== '') {
                        subCount++;
                    }
                }

                return `<td style="padding:0.4rem; text-align:center;"><input type="number" class="mark-cell-input" data-student="${s.id}" data-subject="${sub}" value="${score}" placeholder="-" ${isAnnual || readOnly ? 'disabled' : ''} oninput="Actions.calculateGridTotals(this)" onblur="Actions.saveMark(this)" onkeydown="Actions.handleGridNavigation(event, this)"></td>`;
            }).join('');

            const rowAvg = subCount ? (rowTotal / subCount) : 0;

            // Get non-subject fields
            const attendance = marks.find(m => m.studentId == s.id && m.term === term && m.field === 'attendance' && m.year === currentYear)?.value || '';
            const discipline = marks.find(m => m.studentId == s.id && m.term === term && m.field === 'discipline' && m.year === currentYear)?.value || '';
            const comments = marks.find(m => m.studentId == s.id && m.term === term && m.field === 'comments' && m.year === currentYear)?.value || '';

            return `
                <tr data-student-id="${s.id}">
                    <td style="text-align:center; color:var(--success); cursor:pointer;" onclick="Router.navigate('student-profile', ${s.id})">🔍</td>
                    <td style="text-align:center;"><input type="checkbox" class="exam-row-checkbox" data-student-id="${s.id}"></td>
                    ${colVis.regNo ? `<td>S${s.regNumber || s.id}</td>` : ''}
                    <td style="text-align:center; font-weight:700; background:#fffbeb; color:#92400e;">${rank}</td>
                    <td class="font-bold" style="sticky; left:80px; background:white; text-align:left;">${s.name}</td>
                    ${colVis.motherName ? `<td>${s.motherName || '-'}</td>` : ''}
                    ${colVis.sex ? `<td>${s.sex || '-'}</td>` : ''}
                    ${subjectCols}
                    ${colVis.total ? `<td class="row-total font-bold text-primary" style="text-align:center; background:#f0f9ff;">${rowTotal.toFixed(1)}</td>` : ''}
                    ${colVis.avg ? `<td class="row-avg font-bold text-danger" style="text-align:center; background:#fdf2f2;">${rowAvg.toFixed(2)}</td>` : ''}
                    <td><input type="text" class="form-input mark-input-sm mark-field" data-field="discipline" value="${discipline}" placeholder=""></td>
                    <td><input type="text" class="form-input mark-input-sm mark-field" data-field="attendance" value="${attendance}" placeholder=""></td>
                    <td><input type="text" class="form-input mark-input-lg mark-field" data-field="comments" value="${comments}" placeholder=""></td>
                </tr>
            `;
        }).join('');
        tbody.innerHTML = rowsHtml;

        Render.lastFilteredStudents = students;
        Render.populateColumnSelector(subjects);
        Render.updateExamSidebarStats();
    },

    populateColumnSelector: (subjects) => {
        const menu = document.getElementById('col-vis-menu');
        if (!menu) return;

        const colVis = Store.cache.colVis || {};
        const items = [
            { id: 'regNo', label: 'Student Reg No' },
            { id: 'motherName', label: 'Mother Name' },
            { id: 'sex', label: 'Sex' },
            { id: 'total', label: 'Total' },
            { id: 'avg', label: 'Average' }
        ];

        let html = '<div class="dropdown-label">Student Information</div>';

        items.forEach(item => {
            html += `
                <label class="col-item">
                    <input type="checkbox" ${colVis[item.id] !== false ? 'checked' : ''} onchange="Actions.toggleColumn('${item.id}')">
                    ${item.label}
                </label>
            `;
        });

        html += '<div class="dropdown-label">Marks & Subjects</div>';

        subjects.forEach(sub => {
            html += `
                <label class="col-item">
                    <input type="checkbox" ${colVis[sub] !== false ? 'checked' : ''} onchange="Actions.toggleColumn('${sub}')">
                    ${sub}
                </label>
            `;
        });

        menu.innerHTML = html;
    },

    getGrade: (score) => {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }
};

// --- ACTIONS ---
const Actions = {
    addStudent: async (e) => {
        e.preventDefault();
        if (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator') return alert('Access Denied: Only Head Teacher or Administrator can manage students.');
        const form = e.target;
        const students = Store.get('students');
        const editingId = Store.cache.editingStudentId;

        // Harvest all fields
        const formData = new FormData(form);
        const studentData = {};

        // Handle Photo Upload separately
        const fileInput = form.querySelector('input[name="photo"]');
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const toBase64 = file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });

            try {
                studentData.photo = await toBase64(file);
            } catch (err) {
                console.error("Photo Error", err);
            }
        }

        for (let [key, value] of formData.entries()) {
            if (key !== 'photo') studentData[key] = value;
        }

        if (studentData.className) {
            studentData.className = Constants.normalizeClassName(studentData.className);
        }

        if (editingId) {
            // Update mode
            try {
                studentData.id = editingId;
                studentData.schoolId = Config.schoolId;
                await db.collection('students').doc(editingId.toString()).update(studentData);
                Store.cache.editingStudentId = null;
                form.reset();
                form.querySelector('button[type="submit"]').innerText = 'Save Student Data';
                alert('Student Updated Successfully!');
                Router.navigate('students');
            } catch (err) {
                console.error("Firestore Update Error:", err);
                alert("Error updating student: " + err.message);
            }
        } else {
            // Add mode
            const shortIds = students.map(s => parseInt(s.id)).filter(id => !isNaN(id) && id < 10000000);
            const maxId = shortIds.length > 0 ? Math.max(...shortIds) : 1000;
            studentData.id = Math.max(1001, maxId + 1);

            // Auto-generate defaults (Sequential)
            const generateRegNo = () => {
                const students = Store.get('students');
                const maxReg = students.reduce((max, s) => {
                    const num = parseInt(s.regNumber);
                    return !isNaN(num) && num > max ? num : max;
                }, 1000);
                return (maxReg + 1).toString();
            };

            // Apply Defaults if missing
            studentData.schoolId = Config.schoolId;

            if (!studentData.regNumber || studentData.regNumber.trim() === '') {
                studentData.regNumber = generateRegNo();
            }
            if (!studentData.regDate || studentData.regDate.trim() === '') {
                studentData.regDate = new Date().toISOString().split('T')[0];
            }

            // Save to Firestore
            const docId = studentData.id.toString();
            try {
                await db.collection('students').doc(docId).set(studentData);
                form.reset();
                Router.navigate('students');
                alert(`Student Saved to Cloud! Reg No: ${studentData.regNumber}`);
            } catch (err) {
                console.error("Firestore Save Error:", err);
                alert("Error saving to Cloud: " + err.message);
            }
        }
    },

    editStudent: (id) => {
        if (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator') return alert('Access Denied');
        const student = Store.get('students').find(s => s.id == id);
        if (!student) return;

        Store.cache.editingStudentId = student.id;
        const form = document.getElementById('add-student-form');

        // Populate form fields
        for (let key in student) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input && input.type !== 'file') {
                input.value = student[key];
            }
        }

        // Change button text
        form.querySelector('button[type="submit"]').innerText = 'Update Student Data';

        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth' });
    },

    deleteStudent: async (id) => {
        if (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator') return alert('Access Denied');
        if (confirm('Are you sure you want to delete this student?')) {
            await db.collection('students').doc(id.toString()).delete();
            // sync will auto-refresh UI
        }
    },

    addStaff: async (e) => {
        e.preventDefault();
        if (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator') return alert('Access Denied');
        const form = e.target;
        const editingId = Store.cache.editingStaffId;

        // Collect checked subjects
        const checkedSubjects = Array.from(form.querySelectorAll('input[name="subject"]:checked'))
            .map(cb => cb.value);

        // Subject validation only for Teachers
        const role = form.role.value;
        if (role === 'Teacher' && checkedSubjects.length === 0) {
            return alert('Please select at least one subject for Teachers');
        }

        // Collect checked levels
        const checkedLevels = Array.from(form.querySelectorAll('input[name="level"]:checked'))
            .map(cb => cb.value);

        if (role === 'Teacher' && checkedLevels.length === 0) {
            return alert('Please select at least one education level for Teachers');
        }

        // Generate short sequential ID for new members
        const staff = Store.get('staff');
        const shortIds = staff.map(s => parseInt(s.id)).filter(id => !isNaN(id) && id < 10000000);
        const maxId = shortIds.length > 0 ? Math.max(...shortIds) : 999;
        const newId = Math.max(1000, maxId + 1);

        const staffData = {
            id: editingId || newId,
            schoolId: Config.schoolId,
            name: form.name.value,
            email: form.email.value,
            password: form.password.value,
            role: form.role.value,
            phone: form.phone.value,
            level: checkedLevels.join(', '), // Store as comma separated string
            subject: checkedSubjects.join(', ') // Store as comma separated string
        };

        if (editingId) {
            await db.collection('staff').doc(editingId.toString()).update(staffData);
            Store.cache.editingStaffId = null;
            form.querySelector('button[type="submit"]').innerText = 'Add Staff Member';
            alert('Staff Member Updated!');
        } else {
            await db.collection('staff').doc(staffData.id.toString()).set(staffData);
            alert('Staff Member Added!');
        }

        form.reset();
        Render.updateStaffSubjects(); // Clear subjects container
    },

    editStaff: (id) => {
        if (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator') return alert('Access Denied');
        const staff = Store.get('staff').find(s => s.id == id);
        if (!staff) return;

        Store.cache.editingStaffId = staff.id;
        const form = document.getElementById('add-staff-form');

        // Populate fields
        form.name.value = staff.name;
        form.email.value = staff.email || '';
        form.password.value = staff.password || '';
        form.role.value = staff.role;
        form.phone.value = staff.phone;

        if (staff.level) {
            // Check the level checkboxes
            const levels = staff.level.split(', ');
            levels.forEach(level => {
                const cb = form.querySelector(`input[name="level"][value="${level.trim()}"]`);
                if (cb) cb.checked = true;
            });
            Render.updateStaffSubjects();

            // Check the subjects
            const subjects = staff.subject.split(', ');
            // Small delay to ensure subjects are rendered
            setTimeout(() => {
                subjects.forEach(sub => {
                    const cb = form.querySelector(`input[name="subject"][value="${sub.trim()}"]`);
                    if (cb) cb.checked = true;
                });
            }, 50);
        }

        form.querySelector('button[type="submit"]').innerText = 'Update Staff Member';
        form.scrollIntoView({ behavior: 'smooth' });
    },

    deleteStaff: async (id) => {
        if (confirm('Delete this staff member?')) {
            await db.collection('staff').doc(id.toString()).delete();
        }
    },

    showChangePasswordModal: () => {
        document.getElementById('password-modal').classList.remove('hidden');
        document.getElementById('change-password-form').reset();
        document.getElementById('password-error').classList.add('hidden');
    },

    closePasswordModal: () => {
        document.getElementById('password-modal').classList.add('hidden');
    },

    changePassword: async (e) => {
        e.preventDefault();
        const oldPass = document.getElementById('old-pass').value;
        const newPass = document.getElementById('new-pass').value;
        const confirmPass = document.getElementById('confirm-pass').value;
        const errorDiv = document.getElementById('password-error');

        // Validation
        if (newPass !== confirmPass) {
            errorDiv.textContent = 'New passwords do not match!';
            errorDiv.classList.remove('hidden');
            return;
        }

        if (newPass.length < 6) {
            errorDiv.textContent = 'Password must be at least 6 characters!';
            errorDiv.classList.remove('hidden');
            return;
        }

        // Verify old password
        const user = Auth.user;
        if (!user) return;

        // Check if current password is correct
        if (user.role === 'head_teacher' || user.role === 'administrator') {
            // For head teacher, check against hardcoded credentials
            const adminCreds = [
                { user: 'head@school.com', pass: 'admin123' },
                { user: 'admin', pass: 'admin' }
            ];
            const validOldPass = adminCreds.some(c => c.pass === oldPass);
            if (!validOldPass) {
                errorDiv.textContent = 'Current password is incorrect!';
                errorDiv.classList.remove('hidden');
                return;
            }
            // For head teacher, store in a special settings doc
            await db.collection('settings').doc('head_teacher_password').set({ password: newPass });
            alert('Password updated successfully! Please use your new password on next login.');
        } else {
            // For teachers, find their staff record
            const staff = Store.get('staff');
            const staffRecord = staff.find(s => s.email && s.email.toLowerCase() === user.email?.toLowerCase());

            if (!staffRecord || staffRecord.password !== oldPass) {
                errorDiv.textContent = 'Current password is incorrect!';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Update staff password in Firestore
            await db.collection('staff').doc(staffRecord.id.toString()).update({ password: newPass });
            alert('Password updated successfully! Please use your new password on next login.');
        }

        Actions.closePasswordModal();
    },

    readMessage: async (id) => {

        const messages = Store.get('messages');
        const msg = messages.find(m => m.id === id);
        if (msg) {
            await db.collection('messages').doc(id.toString()).update({ read: true });
        }
    },

    deleteSelectedStudents: async () => {
        const checkboxes = document.querySelectorAll('.student-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);

        if (selectedIds.length === 0) {
            return alert('Please select at least one student to delete');
        }

        if (confirm(`Are you sure you want to delete ${selectedIds.length} selected student(s)? This cannot be undone.`)) {
            const batch = db.batch();
            selectedIds.forEach(id => {
                batch.delete(db.collection('students').doc(id.toString()));
            });
            await batch.commit();
            alert(`${selectedIds.length} student(s) deleted successfully!`);

            // Reset checkboxes
            document.getElementById('select-all-students').checked = false;
            Actions.updateDeleteButton();
        }
    },

    toggleSelectAllStudents: () => {
        const selectAll = document.getElementById('select-all-students');
        const checkboxes = document.querySelectorAll('.student-checkbox');
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
        Actions.updateDeleteButton();
    },

    updateDeleteButton: () => {
        const checkboxes = document.querySelectorAll('.student-checkbox:checked');
        const deleteBtn = document.getElementById('delete-selected-btn');
        const releaseBtn = document.getElementById('release-selected-btn');
        const lockBtn = document.getElementById('lock-selected-btn');
        const syncBtn = document.getElementById('sync-selected-btn');

        const showBulk = checkboxes.length > 0;

        if (deleteBtn) {
            deleteBtn.style.display = showBulk ? 'inline-block' : 'none';
            if (showBulk) {
                deleteBtn.textContent = `🗑️ Delete Selected (${checkboxes.length})`;
            }
        }

        if (releaseBtn) releaseBtn.style.display = showBulk ? 'inline-block' : 'none';
        if (lockBtn) lockBtn.style.display = showBulk ? 'inline-block' : 'none';
        if (syncBtn) syncBtn.style.display = showBulk ? 'inline-block' : 'none';
    },

    toggleStudentExams: async (id, currentEffectiveState) => {
        if (!Auth.user || (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator')) {
            return alert('Only Head Teachers and Administrators can release/lock exams.');
        }

        const s = Store.get('students').find(std => std.id == id);
        if (!s) return;

        const indVal = s.examsReleased;
        let nextState;

        // 3-State Cycle: Default (null) -> Manual Release (true) -> Manual Lock (false) -> Default (null)
        if (indVal === undefined || indVal === null || indVal === '') {
            nextState = true;
        } else if (indVal === true || indVal === 'true') {
            nextState = false;
        } else {
            nextState = null; // Reset to school default
        }

        try {
            const updateData = { schoolId: Config.schoolId };
            if (nextState === null) {
                updateData.examsReleased = firebase.firestore.FieldValue.delete();
            } else {
                updateData.examsReleased = nextState;
            }
            await db.collection('students').doc(id.toString()).update(updateData);
        } catch (err) {
            console.error("Update error:", err);
            alert("Failed to update exam status.");
        }
    },

    bulkToggleStudentExams: async (status) => {
        const checkboxes = document.querySelectorAll('.student-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);

        if (selectedIds.length === 0) return alert('Select students first.');

        if (confirm(`${status === null ? 'Reset to school default' : (status ? 'Release' : 'Lock')} exams for ${selectedIds.length} students?`)) {
            const batch = db.batch();
            selectedIds.forEach(id => {
                const updateData = { schoolId: Config.schoolId };
                if (status === null) {
                    updateData.examsReleased = firebase.firestore.FieldValue.delete();
                } else {
                    updateData.examsReleased = status;
                }
                batch.update(db.collection('students').doc(id.toString()), updateData);
            });
            await batch.commit();
            alert(`Updated ${selectedIds.length} students.`);

            // Reset checkboxes
            document.getElementById('select-all-students').checked = false;
            Actions.updateDeleteButton();
        }
    },

    deleteAllStudents: async () => {
        if (confirm('CRITICAL WARNING: This will delete ALL student data permanently. This cannot be undone.\n\nAre you sure you want to proceed?')) {
            if (confirm('Please confirm one last time: DELETE ALL STUDENTS?')) {
                const students = Store.get('students');
                const batch = db.batch();
                students.forEach(s => batch.delete(db.collection('students').doc(s.id.toString())));
                await batch.commit();
                alert('All students deleted.');
            }
        }
    },

    migrateTo1000: async () => {
        if (!confirm("This will migrate all students with IDs < 1000 to (ID + 1000). Marks and messages will also be updated. Continue?")) return;

        const students = Store.get('students');
        const marks = Store.get('marks');
        const studentsToMigrate = students.filter(s => parseInt(s.id) < 1000);

        if (studentsToMigrate.length === 0) return alert("No students found with IDs < 1000.");

        console.log(`Migrating ${studentsToMigrate.length} students...`);
        let count = 0;

        for (const s of studentsToMigrate) {
            const oldId = s.id.toString();
            const newIdVal = parseInt(oldId) + 1000;
            const newId = newIdVal.toString();

            const batch = db.batch();
            const studentData = { ...s, id: newId, regNumber: newId };

            // 1. Create new student doc
            batch.set(db.collection('students').doc(newId), studentData);

            // 2. Migrate Related Marks
            const studentMarks = marks.filter(m => m.studentId === oldId);
            studentMarks.forEach(m => {
                const oldMarkId = `${oldId}_${m.subject || m.field}_${m.term}_${m.year}`.replace(/\s+/g, '_');
                const newMarkId = `${newId}_${m.subject || m.field}_${m.term}_${m.year}`.replace(/\s+/g, '_');

                batch.set(db.collection('marks').doc(newMarkId), { ...m, studentId: newId });
                batch.delete(db.collection('marks').doc(oldMarkId));
            });

            // 3. Delete old student doc
            batch.delete(db.collection('students').doc(oldId));

            await batch.commit();
            count++;
            console.log(`Migrated ${count}/${studentsToMigrate.length}: ${s.name}`);
        }

        alert(`Migration Complete! ${count} students moved to 1000+ IDs.`);
        location.reload(); // Refresh to ensure store is clean
    },

    filterStudents: () => {
        const query = document.querySelector('input[placeholder="Search students..."]').value.toLowerCase();
        const classFilter = document.getElementById('class-filter').value;
        const students = Store.get('students');

        const filtered = students.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(query) || s.regNumber.toString().includes(query);
            const matchesClass = classFilter === '' || s.className === classFilter;
            return matchesSearch && matchesClass;
        });

        const tbody = document.getElementById('students-table-body');
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No students found matching filters.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(s => `
            <tr>
                <td><input type="checkbox" class="student-checkbox" data-id="${s.id}" onchange="Actions.updateDeleteButton()"></td>
                <td>S${s.regNumber || s.id}</td>
                <td class="font-bold text-primary">${s.name}</td>
                <td>${s.className || s.grade}</td>
                <td>${s.guardianName || s.parent}</td>
                <td>${s.guardianPhone || '-'}</td>
                <td><span class="badge ${s.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${s.status}</span></td>
                <td>
                    <span class="badge ${s.examsReleased ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}" 
                          style="cursor:pointer;" 
                          onclick="Actions.toggleStudentExams(${s.id}, ${!!s.examsReleased})"
                          title="${s.examsReleased ? 'Click to Lock' : 'Click to Release'}">
                        ${s.examsReleased ? '👁️ Released' : '🙈 Locked'}
                    </span>
                </td>
                <td>
                    <button class="btn-sm" onclick="Router.navigate('student-profile', ${s.id})" title="View Details">👁️</button>
                    <button class="btn-sm" onclick="Actions.editStudent(${s.id})" title="Edit">✏️</button>
                    <button class="btn-sm text-danger" onclick="Actions.deleteStudent(${s.id})" title="Delete">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    importCSV: (input) => {
        const file = input.files[0];
        if (!file) return;

        // Auto-generate Reg Number helper (Sequential)
        let maxReg = 0;
        const sList = Store.get('students');
        if (sList.length > 0) {
            maxReg = sList.reduce((max, s) => {
                const num = parseInt(s.regNumber);
                return !isNaN(num) && num > max ? num : max;
            }, 0);
        }
        let currentRegNo = maxReg + 1;

        const generateRegNo = () => {
            return (currentRegNo++).toString();
        };

        // Sequential Short IDs
        const sListForId = Store.get('students');
        const shortIdsForImport = sListForId.map(s => parseInt(s.id)).filter(id => !isNaN(id) && id < 10000000);
        let currentImportId = Math.max(1, (shortIdsForImport.length > 0 ? Math.max(...shortIdsForImport) : 0) + 1);

        const processData = async (rows) => {
            const batch = db.batch();
            let addedCount = 0;

            // 1. Find Header Row
            let headerIndex = -1;
            let headers = {};
            const knownCols = ['reg', 'name', 'class', 'grade', 'guardian', 'phone', 'sex', 'gender', 'status', 'mother', 'dob', 'date', 'place', 'disability', 'orphan', 'nation', 'region', 'district', 'village'];

            // Scan first 10 rows for header matches
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const rowStr = JSON.stringify(rows[i]).toLowerCase();
                let matchCount = 0;
                knownCols.forEach(k => { if (rowStr.includes(k)) matchCount++; });

                if (matchCount >= 2) {
                    headerIndex = i;
                    const row = rows[i];
                    const cols = Array.isArray(row) ? row : row.split(',');
                    cols.forEach((col, idx) => {
                        const c = (col || '').toString().toLowerCase().trim();
                        if (c.includes('reg') && !c.includes('date') && !c.includes('region')) headers['regNumber'] = idx;
                        else if (c.includes('name') && !c.includes('mother') && !c.includes('guardian')) headers['name'] = idx;
                        else if (c.includes('mother')) headers['motherName'] = idx;
                        else if (c.includes('guardian') && c.includes('name')) headers['guardianName'] = idx;
                        else if (c.includes('guardian') && c.includes('phone')) headers['guardianPhone'] = idx;
                        else if (c.includes('guardian')) headers['guardianName'] = idx;
                        else if (c.includes('class') || c.includes('grade')) headers['className'] = idx;
                        else if (c.includes('phone') && c.includes('guardian')) headers['guardianPhone'] = idx;
                        else if (c.includes('phone')) headers['phone'] = idx;
                        else if (c.includes('sex') || c.includes('gender')) headers['sex'] = idx;
                        else if (c.includes('status')) headers['status'] = idx;
                        else if (c.includes('birth') && c.includes('place')) headers['birthPlace'] = idx;
                        else if (c.includes('birth') || c.includes('dob')) headers['dob'] = idx;
                        else if (c.includes('reg') && c.includes('date')) headers['regDate'] = idx;
                        else if (c.includes('disability')) headers['disability'] = idx;
                        else if (c.includes('orphan')) headers['orphan'] = idx;
                        else if (c.includes('nation')) headers['nationality'] = idx;
                        else if (c.includes('region')) headers['region'] = idx;
                        else if (c.includes('district')) headers['district'] = idx;
                        else if (c.includes('village')) headers['village'] = idx;
                    });
                    break;
                }
            }

            if (headerIndex === -1 && rows.length > 0) {
                headerIndex = -1;
                headers = { regNumber: 0, name: 1, className: 2, guardianName: 3, guardianPhone: 4, status: 5 };
            }

            for (let i = headerIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                const cols = Array.isArray(row) ? row : (row.split ? row.split(',') : []);
                if (cols.length < 2) continue;

                const getVal = (key) => {
                    const idx = headers[key];
                    if (idx !== undefined && cols[idx] !== undefined) {
                        return cols[idx].toString().trim().replace(/^"|"$/g, '');
                    }
                    return null;
                };

                const regNo = getVal('regNumber') || generateRegNo();
                const newS = {
                    id: currentImportId++,
                    regNumber: regNo,
                    name: getVal('name') || cols[1] || 'Unknown',
                    className: getVal('className') || cols[2] || 'Form 1',
                    guardianName: getVal('guardianName') || cols[3] || '-',
                    guardianPhone: getVal('guardianPhone') || cols[4] || '-',
                    status: getVal('status') || cols[5] || 'Active',
                    motherName: getVal('motherName') || '-',
                    sex: getVal('sex') || '-',
                    dob: getVal('dob') || '-',
                    birthPlace: getVal('birthPlace') || '-',
                    phone: getVal('phone') || '-',
                    disability: getVal('disability') || 'No Disability',
                    orphan: getVal('orphan') || 'Not orphan',
                    nationality: getVal('nationality') || 'Somali',
                    region: getVal('region') || 'Banadir',
                    district: getVal('district') || '-',
                    village: getVal('village') || '-',
                    regDate: getVal('regDate') || new Date().toISOString().split('T')[0]
                };

                if (newS.className) {
                    newS.className = Constants.normalizeClassName(newS.className);
                }

                // Ensure schoolId is added for isolation
                newS.schoolId = Config.schoolId;

                const docRef = db.collection('students').doc(newS.id.toString());
                batch.set(docRef, newS);
                addedCount++;
            }
            try {
                await batch.commit();
                alert(`Successfully imported ${addedCount} students to Cloud!`);
                input.value = '';
            } catch (err) {
                console.error("Batch Import Error:", err);
                alert("Error during Cloud Import: " + err.message);
            }
        };

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                // Get raw data (array of arrays)
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                processData(jsonData);
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Fallback CSV
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const rows = text.split('\n').filter(r => r.trim() !== '');
                processData(rows);
            };
            reader.readAsText(file);
        }
    },

    exportCSV: () => {
        const students = Store.get('students');
        if (students.length === 0) return alert('No data to export');

        // Full Headers
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Reg No,Name,Class,Mother Name,Gender,DOB,Birth Place,Student Phone,Disability,Orphan Status,Guardian Name,Guardian Phone,Nationality,Region,District,Village,Reg Date,Status\n";

        // Rows
        students.forEach(s => {
            const row = [
                s.regNumber || '',
                `"${s.name || ''}"`,
                s.className || '',
                `"${s.motherName || ''}"`,
                s.sex || '',
                s.dob || '',
                `"${s.birthPlace || ''}"`,
                s.phone || '',
                s.disability || '',
                s.orphan || '',
                `"${s.guardianName || ''}"`,
                s.guardianPhone || '',
                s.nationality || '',
                s.region || '',
                s.district || '',
                s.village || '',
                s.regDate || '',
                s.status || ''
            ].join(",");
            csvContent += row + "\n";
        });

        // Download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "students_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    saveMarks: async () => {
        const term = document.getElementById('exam-term-select').value;
        const year = Store.cache.currentYear;
        const rows = document.querySelectorAll('#marks-table-body tr');
        const batch = db.batch();

        rows.forEach(row => {
            const studentId = row.getAttribute('data-student-id');
            const scoreInputs = row.querySelectorAll('.mark-cell-input');
            const fieldInputs = row.querySelectorAll('.mark-field');

            // Save Subject Scores
            scoreInputs.forEach(input => {
                const subject = input.getAttribute('data-subject');
                const score = input.value;
                if (!subject) return;

                const idWithSpaces = `${studentId}_${subject}_${term}_${year}`;
                const markId = idWithSpaces.replace(/\s+/g, '_');

                if (score.trim() === '') {
                    batch.delete(db.collection('marks').doc(markId));
                    if (idWithSpaces !== markId) {
                        batch.delete(db.collection('marks').doc(idWithSpaces));
                    }
                } else {
                    batch.set(db.collection('marks').doc(markId), {
                        schoolId: Config.schoolId,
                        studentId: studentId.toString(),
                        subject: subject.toString(),
                        term: term.toString(),
                        year: year.toString(),
                        score: score.toString(),
                        timestamp: new Date().toISOString()
                    }, { merge: true });
                }
            });

            // Save Field Data (Attendance, etc.)
            fieldInputs.forEach(input => {
                const field = input.getAttribute('data-field');
                const value = input.value;
                const docId = `${studentId}_${field}_${term}_${year}`.replace(/\s+/g, '_');
                if (value.trim() === '') {
                    batch.delete(db.collection('marks').doc(docId));
                } else {
                    batch.set(db.collection('marks').doc(docId), {
                        schoolId: Config.schoolId,
                        studentId: studentId.toString(),
                        field: field.toString(),
                        term: term.toString(),
                        year: year.toString(),
                        value: value.toString(),
                        timestamp: new Date().toISOString()
                    }, { merge: true });
                }
            });
        });

        try {
            await batch.commit();
            alert('All marks saved successfully!');
        } catch (err) {
            console.error("Batch Save Error", err);
            alert("Error saving marks: " + err.message);
        }
    },

    saveMark: async (input) => {
        const studentId = input.dataset.student;
        const subject = input.dataset.subject;
        const score = input.value;
        const termSelect = document.getElementById('exam-term-select');
        const term = termSelect ? termSelect.value : 'Term 1';
        const year = Store.cache.currentYear || '2025-2026';

        // Check lock (reading from settings for accuracy)
        const settings = Store.get('settings');
        const isLocked = settings.find(d => d.id === 'exam_lock')?.locked;
        if (isLocked && (Auth.user.role !== 'head_teacher' && Auth.user.role !== 'administrator')) return;

        if (!studentId || !subject) return;

        const markId = `${studentId}_${subject}_${term}_${year}`.replace(/\s+/g, '_');

        try {
            if (score.trim() === '') {
                // Delete ANY possible variation of this mark ID to be safe
                const idWithSpaces = `${studentId}_${subject}_${term}_${year}`;
                const idWithUnderscores = idWithSpaces.replace(/\s+/g, '_');
                await db.collection('marks').doc(idWithUnderscores).delete();
                if (idWithSpaces !== idWithUnderscores) {
                    await db.collection('marks').doc(idWithSpaces).delete();
                }
            } else {
                await db.collection('marks').doc(markId).set({
                    schoolId: Config.schoolId,
                    studentId: studentId.toString(),
                    subject: subject.toString(),
                    term: term.toString(),
                    year: year.toString(),
                    score: score.toString(),
                    timestamp: new Date().toISOString()
                }, { merge: true });
            }
        } catch (e) { console.error("Auto-save failed", e); }
    },

    handleGridNavigation: (e, input) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const currentSubject = input.dataset.subject;
            const currentRow = input.closest('tr');
            const nextRow = currentRow.nextElementSibling;

            if (nextRow) {
                const targetInput = nextRow.querySelector(`input[data-subject="${currentSubject}"]`);
                if (targetInput) {
                    targetInput.focus();
                    targetInput.select();
                }
            }
        }
    },

    calculateGridTotals: (input) => {
        const row = input.closest('tr');
        if (!row) return;

        const inputs = row.querySelectorAll('.mark-cell-input');
        const totalCell = row.querySelector('.row-total');
        const avgCell = row.querySelector('.row-avg');

        let total = 0;
        let count = 0;
        inputs.forEach(i => {
            const val = parseFloat(i.value);
            if (!isNaN(val)) {
                total += val;
                count++;
            }
        });

        const finalTotal = total.toFixed(1);
        const finalAvg = count ? (total / count).toFixed(2) : '0.00';

        if (totalCell) totalCell.innerText = finalTotal;
        if (avgCell) avgCell.innerText = finalAvg;
    },

    switchExamYear: (year) => {
        Store.cache.currentYear = year;
        Render.exams();
    },

    toggleSelectAll: (master) => {
        const cbs = document.querySelectorAll('.exam-row-checkbox');
        cbs.forEach(cb => cb.checked = master.checked);
    },

    printSelected: () => {
        const selectedIds = Array.from(document.querySelectorAll('.exam-row-checkbox:checked'))
            .map(cb => cb.getAttribute('data-student-id'));

        const className = document.getElementById('exam-class-filter-sidebar')?.value || 'All Classes';
        const term = document.getElementById('exam-term-select').value;
        const year = Store.cache.currentYear;
        const colVis = Store.cache.colVis;

        // If nothing selected, offer to print the whole filtered list
        let studentsToPrint = [];
        if (selectedIds.length === 0) {
            if (confirm('No students selected. Print all students currently in the list?')) {
                studentsToPrint = Render.lastFilteredStudents || [];
            } else {
                return;
            }
        } else {
            studentsToPrint = Store.get('students').filter(s => selectedIds.includes(s.id.toString()));
        }

        if (studentsToPrint.length === 0) return alert('No data to print.');

        // Get subjects matching the current class level (same logic as examsEntry)
        const dynamicSubjects = Store.get('subjects');
        let subjects = [];
        if (className && className !== 'All Classes') {
            const lower = className.toLowerCase();
            let level = 'Secondary';
            if (lower.includes('grade 1') || lower.includes('grade 2') || lower.includes('grade 3') || lower.includes('grade 4')) level = 'LowerPrimary';
            else if (lower.includes('grade 5') || lower.includes('grade 6') || lower.includes('grade 7') || lower.includes('grade 8')) level = 'UpperPrimary';
            subjects = dynamicSubjects.filter(s => s.level === level).map(s => s.name);
            if (subjects.length === 0) subjects = Constants.getSubjects(className);
        } else {
            subjects = Constants.Subjects.LowerPrimary;
        }

        const marks = Store.get('marks');

        // Create Print Window
        const printWin = window.open('', '_blank', 'width=1000,height=800');

        const isAnnual = term === 'Annual';

        // Ensure students are sorted by total marks before printing
        studentsToPrint.forEach(s => {
            let total = 0;
            subjects.forEach(sub => {
                if (isAnnual) {
                    ['Term 1', 'Term 2', 'Term 3', 'Term 4'].forEach(t => {
                        const rec = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === t && m.year === year);
                        total += parseFloat(rec?.score || 0);
                    });
                } else {
                    const record = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === term && m.year === year) || {};
                    total += parseFloat(record.score || 0);
                }
            });
            s._gridTotal = total;
        });
        studentsToPrint.sort((a, b) => b._gridTotal - a._gridTotal);

        let tableHeader = `
            <th style="width:50px;">Rank</th>
            <th>Reg No</th>
            <th style="text-align:left;">Student Name</th>
        `;
        if (colVis.motherName) tableHeader += `<th>Mother Name</th>`;
        if (colVis.sex) tableHeader += `<th>Sex</th>`;

        subjects.forEach(sub => {
            if (colVis[sub] !== false) tableHeader += `<th>${sub}</th>`;
        });

        if (colVis.total) tableHeader += `<th>${isAnnual ? 'Year Total' : 'Total'}</th>`;
        if (colVis.avg) tableHeader += `<th>${isAnnual ? 'Year Avg' : 'Avg'}</th>`;

        let tableRows = '';
        studentsToPrint.forEach((s, idx) => {
            const rank = idx + 1;
            let rowTotal = s._gridTotal;
            let subCount = 0;
            let subCols = subjects.map(sub => {
                if (colVis[sub] === false) return '';

                let scoreText = '-';
                if (isAnnual) {
                    let sum = 0;
                    ['Term 1', 'Term 2', 'Term 3', 'Term 4'].forEach(t => {
                        const rec = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === t && m.year === year);
                        if (rec && rec.score !== '') {
                            sum += parseFloat(rec.score);
                            subCount++;
                        }
                    });
                    scoreText = sum || '-';
                } else {
                    const m = marks.find(m => m.studentId == s.id && m.subject === sub && m.term === term && m.year === year);
                    if (m && m.score !== '') {
                        subCount++;
                        scoreText = m.score;
                    }
                }
                return `<td>${scoreText}</td>`;
            }).join('');

            const avg = subCount ? (rowTotal / subCount).toFixed(2) : '0.00';

            tableRows += `
                <tr>
                    <td style="font-weight:bold;">${rank}</td>
                    <td>S${s.regNumber || s.id}</td>
                    <td style="text-align:left;">${s.name}</td>
                    ${colVis.motherName ? `<td>${s.motherName || '-'}</td>` : ''}
                    ${colVis.sex ? `<td>${s.sex || '-'}</td>` : ''}
                    ${subCols}
                    ${colVis.total ? `<td style="font-weight:bold;">${rowTotal.toFixed(1)}</td>` : ''}
                    ${colVis.avg ? `<td style="font-weight:bold;">${avg}</td>` : ''}
                </tr>
            `;
        });

        const html = `
            <html>
            <head>
                <title>Master Mark Sheet - ${className}</title>
                <style>
                    @page { size: A4 landscape; margin: 1cm; }
                    body { font-family: 'Inter', sans-serif; color: #333; margin: 0; padding: 20px; }
                    .header { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
                    .logo { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; }
                    .header-info h1 { margin: 0; font-size: 22px; color: #1e293b; }
                    .header-info p { margin: 5px 0 0; font-size: 14px; color: #64748b; }
                    .report-details { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; font-weight: 500; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                    th { background-color: #f8fafc; font-weight: 700; color: #1e293b; }
                    tr:nth-child(even) { background-color: #fafafa; }
                    .footer { margin-top: 50px; display: flex; justify-content: space-between; }
                    .sig-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom: 20px; text-align: right;">
                    <button onclick="window.print()" style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 5px; cursor: pointer;">🖨️ Click to Print A4</button>
                </div>
                <div style="width:100%; margin-bottom: 20px;">
                    <img src="header-banner.jpg" style="width:100%; border-bottom: 4px solid #3498db;" onerror="this.src='https://via.placeholder.com/1000x150?text=BOQOLSOON+SCHOOL+MANAGEMENT+SYSTEM'">
                </div>
                <div class="report-details">
                    <div><strong>Class:</strong> ${className}</div>
                    <div><strong>Term:</strong> ${term}</div>
                    <div><strong>Year:</strong> ${year}</div>
                    <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
                </div>
                <table>
                    <thead><tr>${tableHeader}</tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <div class="footer">
                    <div class="sig-line">Class Teacher Signature</div>
                    <div class="sig-line">Head Teacher Signature</div>
                </div>
            </body>
            </html>
        `;

        printWin.document.write(html);
        printWin.document.close();
    },

    toggleColumn: (colId) => {
        const colVis = Store.cache.colVis;
        colVis[colId] = !(colVis[colId] !== false);
        Render.examsEntry();
    },

    // Academics Actions
    addClass: async (e) => {
        e.preventDefault();
        const rawName = e.target.className.value;
        const level = e.target.classLevel.value;
        if (!rawName) return;

        const name = Constants.normalizeClassName(rawName);
        const id = Date.now().toString();
        await db.collection('classes').doc(id).set({ id, name, level, schoolId: Config.schoolId });
        e.target.reset();
    },

    deleteClass: async (id) => {
        if (confirm('Delete this class?')) {
            await db.collection('classes').doc(id).delete();
        }
    },

    addSubjectToLevel: async () => {
        const level = document.getElementById('academic-level-select').value;
        const name = document.getElementById('new-subject-name').value;
        if (!name) return alert('Enter subject name');
        const id = `${level}_${name}`.replace(/\s+/g, '_');
        await db.collection('subjects').doc(id).set({ id, name, level, schoolId: Config.schoolId });
        document.getElementById('new-subject-name').value = '';
    },

    deleteSubject: async (id) => {
        if (confirm('Remove this subject?')) {
            await db.collection('subjects').doc(id).delete();
        }
    },

    toggleExamLock: async () => {
        const settings = Store.get('settings');
        const lockDoc = settings.find(d => d.id === 'exam_lock');
        const current = lockDoc ? lockDoc.locked : false;
        const newState = !current;
        if (confirm(newState ? 'Lock Exams? Teachers will not be able to edit marks.' : 'Unlock Exams? Teachers will be able to edit marks.')) {
            await db.collection('settings').doc('exam_lock').set({ locked: newState, schoolId: Config.schoolId });
            Render.exams(); // Refresh UI
        }
    },

    toggleExamRelease: async () => {
        const settings = Store.get('settings');
        const releaseDoc = settings.find(d => d.id === 'exam_release');
        const current = releaseDoc ? (releaseDoc.released === true || releaseDoc.released === 'true') : false;
        const newState = !current;

        const msg = newState
            ? 'Release Results for everyone?\n\n- Click OK to just toggle the school setting.\n- Type "RESET" in the box and click OK to also clear all individual overrides.'
            : 'Hide Results for everyone?\n\n- Click OK to just toggle the school setting.\n- Type "RESET" in the box and click OK to also clear all individual overrides.';

        const userInput = prompt(msg, ""); // Default empty string
        if (userInput === null) return; // Cancelled

        await db.collection('settings').doc('exam_release').set({ released: newState, schoolId: Config.schoolId });

        if (userInput.toUpperCase() === 'RESET') {
            const students = Store.get('students');
            const batch = db.batch();
            students.forEach(s => {
                if (s.examsReleased !== undefined) {
                    batch.update(db.collection('students').doc(s.id.toString()), { examsReleased: firebase.firestore.FieldValue.delete() });
                }
            });
            await batch.commit();
            alert(`Global setting updated to ${newState ? 'Released' : 'Hidden'} and all manual overrides cleared.`);
        } else {
            alert(`Global setting updated to ${newState ? 'Released' : 'Hidden'}. Manual student overrides were kept.`);
        }
        Render.exams();
    },

    normalizeExistingData: async () => {
        if (!confirm("This will clean up all Class/Grade names (e.g. 'class 6' becomes 'Grade 6') for ALL students and remove split entries. This is an intensive process. Continue?")) return;

        const students = Store.get('students');
        const classes = Store.get('classes');
        const batch = db.batch();
        let fixCount = 0;
        let studentFixCount = 0;
        let classFixCount = 0;

        // 1. Normalize Students
        students.forEach(s => {
            const raw = s.className || s.grade || '';
            const normalized = Constants.normalizeClassName(raw);

            // Check if updates are needed (name change OR legacy field exists)
            if (raw !== normalized || s.grade !== undefined) {
                const update = { className: normalized };
                // Also ensure any reference to 'grade' is deleted to avoid "s.className || s.grade" pulling wrong data
                update.grade = firebase.firestore.FieldValue.delete();

                batch.update(db.collection('students').doc(s.id.toString()), update);
                fixCount++;
                studentFixCount++;
            }
        });

        // 2. Normalize Classes Collection (and merge duplicates)
        const processedClasses = new Set();
        const classesToDelete = [];

        classes.forEach(c => {
            const normalized = Constants.normalizeClassName(c.name);
            if (processedClasses.has(normalized)) {
                // This class is a duplicate now, delete it
                classesToDelete.push(c.id);
            } else {
                processedClasses.add(normalized);
                if (c.name !== normalized) {
                    batch.update(db.collection('classes').doc(c.id), { name: normalized });
                    fixCount++;
                    classFixCount++;
                }
            }
        });

        // Delete duplicates from classes collection
        classesToDelete.forEach(id => {
            batch.delete(db.collection('classes').doc(id));
            fixCount++;
            classFixCount++;
        });

        if (fixCount === 0) {
            // Check marks even if students/classes are fine
        }

        // 3. Normalize Marks IDs and merge duplicates
        const marks = Store.get('marks');
        const processedMarks = new Set();
        const marksToDelete = [];

        marks.forEach(m => {
            if (!m.studentId || !m.subject || !m.term || !m.year) return;

            // Standard ID format
            const standardId = `${m.studentId}_${m.subject}_${m.term}_${m.year}`.replace(/\s+/g, '_');

            if (processedMarks.has(standardId)) {
                // Duplicate mark (maybe old ID vs new ID), delete current one
                // Firestore id is stored in record.id if sync worked correctly
                if (m.id !== standardId) {
                    marksToDelete.push(m.id);
                }
            } else {
                processedMarks.add(standardId);
                if (m.id !== standardId) {
                    // ID mismatch (likely spaces vs underscores), move to standard ID
                    batch.set(db.collection('marks').doc(standardId), {
                        studentId: m.studentId.toString(),
                        subject: m.subject.toString(),
                        term: m.term.toString(),
                        year: m.year.toString(),
                        score: m.score.toString(),
                        timestamp: m.timestamp || new Date().toISOString()
                    });
                    batch.delete(db.collection('marks').doc(m.id));
                    fixCount++;
                    classFixCount++; // Reusing counter for summary
                }
            }
        });

        marksToDelete.forEach(id => {
            batch.delete(db.collection('marks').doc(id));
            fixCount++;
        });

        if (fixCount === 0) return alert("Everything is already organized! No changes needed.");

        try {
            await batch.commit();
            alert(`Optimization Complete!\n- Updated ${studentFixCount} student records\n- Cleaned up ${classFixCount} class entries\n\nThe dashboard will now refresh.`);
            location.reload();
        } catch (err) {
            console.error("Batch Normalization Error", err);
            alert("Error during cleanup: " + err.message);
        }
    },

    tagExistingData: async () => {
        if (!confirm(`Attention: This will tag ALL existing data in the database as '${Config.schoolName}'. Run this once to claim legacy data for this school. Proceed?`)) return;

        const collections = ['students', 'marks', 'staff', 'classes', 'subjects', 'settings'];
        let totalFixed = 0;

        for (const col of collections) {
            const snapshot = await db.collection(col).get();
            const batch = db.batch();
            let count = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.schoolId) {
                    batch.update(doc.ref, { schoolId: Config.schoolId });
                    count++;
                }
            });

            if (count > 0) {
                await batch.commit();
                totalFixed += count;
            }
        }

        alert(`Success! ${totalFixed} records have been tagged as '${Config.schoolName}'. Your data should now be visible again.`);
        location.reload();
    }
};

// --- AUTHENTICATION ---
const Auth = {
    user: null,

    init: () => {
        const saved = localStorage.getItem('sms_auth');
        if (saved) {
            Auth.user = JSON.parse(saved);
            Auth.showApp();
        } else {
            Auth.showLogin();
        }
    },

    login: async (e) => {
        e.preventDefault();
        const user = document.getElementById('login-username').value;
        const pass = document.getElementById('login-password').value;
        const error = document.getElementById('login-error');

        const inputUser = (user || '').trim().toLowerCase();
        const inputPass = (pass || '').trim();

        // 1. Check Hardcoded Admin/Legacy Credentials (with Firestore override for head teacher)
        const credentials = [
            { user: 'head@school.com', pass: 'admin123', role: 'head_teacher', name: 'Head Teacher' },
            { user: 'admin', pass: 'admin', role: 'head_teacher', name: 'Head Teacher' }
        ];

        // Check if head teacher has updated password in Firestore
        let headTeacherPassword = null;
        try {
            const settingsDoc = await db.collection('settings').doc('head_teacher_password').get();
            if (settingsDoc.exists) {
                headTeacherPassword = settingsDoc.data().password;
            }
        } catch (err) {
            console.log('No custom head teacher password set');
        }

        let match = credentials.find(c => {
            if (c.user.toLowerCase() === inputUser) {
                // If head teacher has custom password, use that instead
                if (c.role === 'head_teacher' && headTeacherPassword) {
                    return headTeacherPassword === inputPass;
                }
                return c.pass === inputPass;
            }
            return false;
        });

        // 2. If no admin match, check Dynamic Staff Collection
        if (!match) {
            const staff = Store.get('staff');
            const staffMatch = staff.find(s =>
                s.email && s.email.toLowerCase() === inputUser &&
                s.password === inputPass
            );
            if (staffMatch) {
                match = {
                    name: staffMatch.name,
                    email: staffMatch.email,
                    role: (staffMatch.role || 'Teacher').toLowerCase().replace(' ', '_'),
                    // Convert "Subject1, Subject2" string to array
                    assignedSubjects: staffMatch.subject ? staffMatch.subject.split(', ').map(s => s.trim()) : [],
                    // Convert "Level1, Level2" string to array
                    assignedLevels: staffMatch.level ? staffMatch.level.split(', ').map(l => l.trim()) : []
                };
            }
        }

        // 3. If no staff match, check Student (RegNo / RegNo)
        if (!match) {
            const students = Store.get('students');
            // Allow login with RegNo as Username AND Password
            const studentMatch = students.find(s =>
                (s.regNumber || '').toString().toLowerCase() === inputUser &&
                (s.regNumber || '').toString().toLowerCase() === inputPass.toLowerCase()
            );

            if (studentMatch) {
                match = {
                    id: studentMatch.id,
                    name: studentMatch.name,
                    role: 'student',
                    regNumber: studentMatch.regNumber
                };
            }
        }

        if (match) {
            Auth.user = {
                id: match.id, // Important for student redirect
                name: match.name,
                email: match.email || inputUser,
                role: match.role,
                assignedSubjects: match.assignedSubjects || [],
                assignedLevels: match.assignedLevels || []
            };
            localStorage.setItem('sms_auth', JSON.stringify(Auth.user));
            Auth.showApp();
            error.classList.add('hidden');
        } else {
            error.classList.remove('hidden');
        }
    },

    logout: () => {
        Auth.user = null;
        localStorage.removeItem('sms_auth');
        Auth.showLogin();
    },

    showLogin: () => {
        document.getElementById('login-overlay').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    },

    showApp: () => {
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');

        // Hide/Show navigation based on role
        Auth.applyRolePermissions();

        if (Auth.user && Auth.user.role === 'student') {
            Router.navigate('student-profile', Auth.user.id);
        } else {
            Router.navigate('dashboard');
        }
    },

    applyRolePermissions: () => {
        if (!Auth.user) return;

        // Admin roles include head_teacher and administrator
        const isHead = Auth.user.role === 'head_teacher' || Auth.user.role === 'administrator';
        const isStudent = Auth.user.role === 'student';

        // COMPONENT VISIBILITY
        const sidebar = document.querySelector('.sidebar');
        const toolbar = document.querySelector('.toolbar');
        const mobileToggle = document.getElementById('mobile-sidebar-toggle');

        if (isStudent) {
            // STRICTLY HIDE ADMIN UI FOR STUDENTS
            if (sidebar) sidebar.style.display = 'none';
            if (toolbar) toolbar.style.display = 'none'; // Hide top navigation bar
            if (mobileToggle) mobileToggle.style.display = 'none';

            // Force redirect if not on student profile
            if (!Router.currentRoute || Router.currentRoute !== 'student-profile') {
                Router.navigate('student-profile', Auth.user.id);
            }
        } else {
            // RESTORE ADMIN UI
            if (sidebar) sidebar.style.display = 'flex';
            if (toolbar) toolbar.style.display = 'flex'; // Restore if it was hidden
            if (mobileToggle) mobileToggle.style.display = 'block';
        }

        // Sidebar Navigation visibility (Head/Admin vs Teacher)
        // Teachers see basic nav, Admins see everything
        const headOnlyNav = ['nav-staff', 'nav-reports', 'nav-academics'];
        headOnlyNav.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isHead ? 'flex' : 'none';
        });

        // Head Teacher/Admin Specific UI
        const headOnlyUI = [
            'student-reg-card',
            'student-actions-btns',
            'student-import-instructions',
            'staff-table-card'
        ];
        headOnlyUI.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isHead ? '' : 'none';
        });
    }
};

// --- ROUTER INTERCEPTOR ---
const OriginalNavigate = Router.navigate;
Router.navigate = function (route, param) {
    // Intercept navigation for Students
    if (Auth.user && Auth.user.role === 'student') {
        const studentId = Auth.user.id.toString();
        // Students are ONLY allowed to view their own profile
        if (route !== 'student-profile' || (param && param.toString() !== studentId)) {
            console.warn('Unauthorized navigation attempt by student.');
            return OriginalNavigate.call(Router, 'student-profile', studentId);
        }
    }
    return OriginalNavigate.call(Router, route, param);
};


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    Store.init();
    Auth.init();

    if (Auth.user) {
        Auth.applyRolePermissions();
    }

    // Bind Navigation (Sidebar)
    Router.routes.forEach(route => {
        const el = document.getElementById(`nav-${route}`);
        if (el) {
            el.addEventListener('click', () => {
                Router.navigate(route);
                // Auto-close sidebar on mobile after click
                if (window.innerWidth <= 768) {
                    document.querySelector('.sidebar').classList.remove('sidebar-open');
                    document.getElementById('sidebar-overlay').classList.remove('active');
                }
            });
        }
    });

    // Mobile Sidebar Toggle Logic
    const toggleBtn = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar-open');
            overlay.classList.toggle('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('sidebar-open');
            overlay.classList.remove('active');
        });
    }

    // Bind Login Form
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', Auth.login);

    // Bind Student Registration
    const studentForm = document.getElementById('add-student-form');
    if (studentForm) studentForm.addEventListener('submit', Actions.addStudent);
    const staffForm = document.getElementById('add-staff-form');
    if (staffForm) staffForm.addEventListener('submit', Actions.addStaff);

    // Bind Academics Form
    const classForm = document.getElementById('add-class-form');
    if (classForm) classForm.addEventListener('submit', Actions.addClass);

    // Bind Change Password Form
    const passwordForm = document.getElementById('change-password-form');
    if (passwordForm) passwordForm.addEventListener('submit', Actions.changePassword);

    // Global click listener to close dropdowns
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-content').forEach(d => d.classList.remove('show'));
        }
    });
});
