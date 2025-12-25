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
    // Map class names to subject levels
    getSubjects: (className) => {
        if (!className) return [];
        const lower = className.toLowerCase();
        if (lower.includes('grade 1') || lower.includes('grade 2') || lower.includes('grade 3') || lower.includes('grade 4')) {
            return Constants.Subjects.LowerPrimary;
        }
        if (lower.includes('grade 5') || lower.includes('grade 6') || lower.includes('grade 7') || lower.includes('grade 8')) {
            return Constants.Subjects.UpperPrimary;
        }
        return Constants.Subjects.Secondary;
    }
};

// --- STATE MANAGEMENT (Firebase Firestore with Local Cache) ---
const Store = {
    cache: {
        students: [],
        marks: [],
        staff: [],
        messages: [],
        editingStudentId: null,
        editingStaffId: null
    },

    get: (key) => Store.cache[key] || [],

    // Sync specific collection
    sync: (key) => {
        db.collection(key).onSnapshot(snapshot => {
            const data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
            Store.cache[key] = data;
            console.log(`Synced ${key}:`, data.length, "items");

            if (Router.current && Render[Router.current]) Render[Router.current]();
            Render.dashboard();
        }, error => {
            console.error(`Firebase Sync Error (${key}):`, error);
            if (error.code === 'permission-denied') {
                alert("⚠️ Firebase Permission Error: Please ensure your Database Rules are set to 'test mode' (allow read, write: if true;)");
            }
        });
    },

    // Initialize Syncing & Migration
    init: async () => {
        // Start Syncing for all collections
        ['students', 'marks', 'staff', 'messages'].forEach(key => Store.sync(key));

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

    navigate: (page, param = null) => {
        Router.current = page;

        // Handle Sidebar active state
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navItem = document.getElementById(`nav-${page}`);
        if (navItem) navItem.classList.add('active');

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
    dashboard: () => {
        const students = Store.get('students');

        // Calculate Stats
        const total = students.length;
        // Robust gender check
        const male = students.filter(s => (s.sex || s.gender || '').toString().toLowerCase().startsWith('m')).length;
        const female = students.filter(s => (s.sex || s.gender || '').toString().toLowerCase().startsWith('f')).length;
        const orphans = students.filter(s => (s.orphan || '').toString().toLowerCase() === 'yes').length;

        // Calculate Percentages
        const malePct = total ? Math.round((male / total) * 100) : 0;
        const femalePct = total ? Math.round((female / total) * 100) : 0;
        // Make cards clickable
        document.querySelectorAll('.stat-card').forEach(card => {
            card.style.cursor = 'pointer';
            card.onclick = () => {
                if (card.classList.contains('c-total') || card.classList.contains('c-male') || card.classList.contains('c-female')) {
                    Router.navigate('students');
                } else if (card.classList.contains('c-orphan')) {
                    Router.navigate('students'); // Could filter for orphans in future
                }
            };
        });

        // Render Chart (Students by Class with Gender Split)
        const classStats = {};
        students.forEach(s => {
            const cls = s.className || 'Unknown';
            if (!classStats[cls]) classStats[cls] = { total: 0, male: 0, female: 0 };
            classStats[cls].total++;
            const g = (s.sex || s.gender || '').toString().toLowerCase();
            if (g.startsWith('m')) classStats[cls].male++;
            else if (g.startsWith('f')) classStats[cls].female++;
        });

        const chartContainer = document.getElementById('dashboard-chart');
        if (chartContainer && total > 0) {
            const maxVal = Math.max(...Object.values(classStats).map(c => c.total));

            // Build visual legend
            const legend = `
                <div style="display:flex; justify-content:flex-end; gap:15px; margin-bottom:10px; font-size:0.85rem;">
                    <div style="display:flex; align-items:center; gap:5px;"><div style="width:12px; height:12px; background:#2ecc71; border-radius:2px;"></div> Boys</div>
                    <div style="display:flex; align-items:center; gap:5px;"><div style="width:12px; height:12px; background:#16a085; border-radius:2px;"></div> Girls</div>
                </div>
            `;

            const barsHtml = Object.keys(classStats).sort().map(cls => {
                const stat = classStats[cls];
                const height = maxVal > 0 ? (stat.total / maxVal) * 200 : 0;

                // Stack heights
                const mPct = stat.total > 0 ? (stat.male / stat.total) * 100 : 0;
                const fPct = stat.total > 0 ? (stat.female / stat.total) * 100 : 0;

                return `
                    <div class="bar-group" title="${cls}: ${stat.male} Boys, ${stat.female} Girls">
                        <div class="bar-value">${stat.total}</div>
                        <div class="bar" style="height: ${height}px; background:#ecf0f1; display:flex; flex-direction:column-reverse; overflow:hidden;">
                            <div style="width:100%; height:${mPct}%; background:#2ecc71;"></div>
                            <div style="width:100%; height:${fPct}%; background:#16a085;"></div>
                        </div>
                        <div class="bar-label">${cls}</div>
                    </div>
                `;
            }).join('');

            chartContainer.innerHTML = legend + barsHtml;
            chartContainer.style.display = 'block'; // ensure block layout for legend
        } else if (chartContainer) {
            chartContainer.innerHTML = '<p class="text-muted" style="width:100%; text-align:center; padding-top:50px;">No Data available for analysis</p>';
        }
    },

    students: () => {
        const students = Store.get('students');
        const tbody = document.getElementById('students-table-body');
        tbody.innerHTML = students.map(s => `
            <tr>
                <td>S${s.regNumber || s.id}</td>
                <td class="font-bold text-primary">${s.name}</td>
                <td>${s.className || s.grade}</td>
                <td>${s.guardianName || s.parent}</td>
                <td>${s.guardianPhone || '-'}</td>
                <td><span class="badge ${s.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${s.status}</span></td>
                <td>
                    <button class="btn-sm" onclick="Router.navigate('student-profile', ${s.id})" title="View Details">👁️</button>
                    <button class="btn-sm" onclick="Actions.editStudent(${s.id})" title="Edit">✏️</button>
                    <button class="btn-sm text-danger" onclick="Actions.deleteStudent(${s.id})" title="Delete">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    'student-profile': (id) => {
        const students = Store.get('students');
        const s = students.find(student => student.id == id);
        if (!s) return Router.navigate('students');

        // Use uploaded photo or fallback avatar
        const photoUrl = s.photo || `https://ui-avatars.com/api/?name=${s.name}&background=random&size=150`;

        const container = document.getElementById('student-profile-content');
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h2 class="page-title">Student Profile</h2>
                <div style="display:flex; gap:1rem;">
                    <button class="btn btn-primary" onclick="window.print()">🖨️ Print / Save PDF</button>
                    <button class="btn" onclick="Router.navigate('students')">← Back to List</button>
                </div>
            </div>
            
            <div class="card" id="printable-area">
                <div style="text-align:center; border-bottom:1px solid #eee; padding-bottom:1rem; margin-bottom:1rem;">
                     <!-- Header for Print -->
                     <h1 style="color:var(--primary);">Boqolsoon School</h1>
                     <p>Student Record Sheet</p>
                </div>

                <div style="display:flex; gap:2rem; align-items:start;">
                    <div style="flex:0 0 150px; text-align:center;">
                        <img src="${photoUrl}" style="border-radius:1rem; margin-bottom:1rem; max-width:150px; border:1px solid #eee;">
                        <div class="badge" style="font-size:1rem; display:inline-block;">${s.status}</div>
                    </div>
                    <div style="flex:1;">
                        <h3 style="margin-bottom:0.5rem; font-size:1.5rem;">${s.name}</h3>
                        <p class="text-muted">Reg No: <strong>${s.regNumber}</strong> | Class: <strong>${s.className}</strong></p>
                        
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:2rem; margin-top:2rem;">
                            <div>
                                <h4 style="border-bottom:1px solid #eee; padding-bottom:0.5rem; margin-bottom:1rem; color:var(--primary);">Personal Info</h4>
                                <p><strong>Mother Name:</strong> ${s.motherName || '-'}</p>
                                <p><strong>Gender:</strong> ${s.sex || '-'}</p>
                                <p><strong>Birth Date:</strong> ${s.dob || '-'}</p>
                                <p><strong>Birth Place:</strong> ${s.birthPlace || '-'}</p>
                                <p><strong>Phone:</strong> ${s.phone || '-'}</p>
                                <p><strong>Disability:</strong> ${s.disability || 'No'}</p>
                                <p><strong>Orphan:</strong> ${s.orphan || 'No'}</p>
                            </div>
                            <div>
                                <h4 style="border-bottom:1px solid #eee; padding-bottom:0.5rem; margin-bottom:1rem; color:var(--primary);">Contact & Enrollment</h4>
                                <p><strong>Guardian:</strong> ${s.guardianName || '-'}</p>
                                <p><strong>Guardian Phone:</strong> ${s.guardianPhone || '-'}</p>
                                <p><strong>Region:</strong> ${s.region || '-'}</p>
                                <p><strong>District:</strong> ${s.district || '-'}</p>
                                <p><strong>Village:</strong> ${s.village || '-'}</p>
                                <p><strong>Reg Date:</strong> ${s.regDate || '-'}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top:2rem; padding-top:2rem; border-top:1px solid #eee; font-size:0.8rem; color:#888; text-align:center;">
                    Generated on ${new Date().toLocaleDateString()} by Boqolsoon SMS
                </div>
            </div>
        `;
    },

    academics: () => {
        // Placeholder
    },

    staff: () => {
        const staff = Store.get('staff');
        const tbody = document.getElementById('staff-table-body');

        // Reset Level Select
        const levelSelect = document.getElementById('staff-level-select');
        if (levelSelect) levelSelect.value = '';

        // Reset Subject Container
        const subjectsContainer = document.getElementById('staff-subjects-container');
        if (subjectsContainer) subjectsContainer.innerHTML = '<p class="text-muted" style="font-size: 0.9rem;">-- Select Level First --</p>';

        tbody.innerHTML = staff.map(t => `
            <tr>
                <td>T${t.id}</td>
                <td class="font-bold text-primary">${t.name}</td>
                <td>${t.role}</td>
                <td>${t.phone}</td>
                <td>${t.subject || '-'}</td>
                <td>
                    <button class="btn-sm" onclick="Actions.editStaff(${t.id})" title="Edit">✏️</button>
                    <button class="btn-sm text-danger" onclick="Actions.deleteStaff(${t.id})" title="Delete">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    updateStaffSubjects: () => {
        const level = document.getElementById('staff-level-select').value;
        const subjectsContainer = document.getElementById('staff-subjects-container');

        if (!level) {
            subjectsContainer.innerHTML = '<p class="text-muted" style="font-size: 0.9rem;">-- Select Level First --</p>';
            return;
        }

        const subjects = Constants.Subjects[level] || [];
        subjectsContainer.innerHTML = subjects.map(s => `
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
        const classSelect = document.getElementById('exam-class-select');
        if (classSelect) {
            classSelect.innerHTML = '<option value="">-- Select Class --</option>' +
                Constants.Classes.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        // Reset subjects
        const subjectSelect = document.getElementById('exam-subject-select');
        if (subjectSelect) subjectSelect.innerHTML = '<option value="">-- Select Class First --</option>';
    },

    updateExamSubjects: () => {
        const className = document.getElementById('exam-class-select').value;
        const subjectSelect = document.getElementById('exam-subject-select');
        if (!className) {
            subjectSelect.innerHTML = '<option value="">-- Select Class First --</option>';
            return;
        }
        const subjects = Constants.getSubjects(className);
        subjectSelect.innerHTML = subjects.map(s => `<option value="${s}">${s}</option>`).join('');
    },

    examsEntry: () => {
        const className = document.getElementById('exam-class-select').value;
        const term = document.getElementById('exam-term-select').value;

        if (!className) return alert('Please select Class');

        const subjects = Constants.getSubjects(className);
        const students = Store.get('students').filter(s => s.className === className);
        const marks = Store.get('marks');

        const container = document.getElementById('marks-entry-container');
        const thead = document.querySelector('#marks-entry-container thead tr');
        const tbody = document.getElementById('marks-table-body');
        const title = document.getElementById('marks-sheet-title');

        title.innerText = `Master Mark Sheet: ${className} | ${term}`;
        container.classList.remove('hidden');

        // Dynamic Headers
        let headerHtml = `
            <th style="padding:0.75rem; sticky; left:0; background:#f8fafc; z-index:2;">Reg No</th>
            <th style="padding:0.75rem; sticky; left:80px; background:#f8fafc; z-index:2;">Student Name</th>
        `;
        subjects.forEach(sub => {
            headerHtml += `<th style="padding:0.75rem; text-align:center;">${sub}</th>`;
        });
        headerHtml += `
            <th style="padding:0.75rem; text-align:center; background:#f0f9ff; font-weight:700;">Total</th>
            <th style="padding:0.75rem; text-align:center; background:#f0f9ff; font-weight:700;">Avg</th>
        `;
        thead.innerHTML = headerHtml;

        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${subjects.length + 4}" style="text-align:center; padding:2rem; color:var(--text-muted);">
                No students registered in <strong>${className}</strong>.
            </td></tr>`;
            return;
        }

        // Body Rows
        tbody.innerHTML = students.map(s => {
            let rowTotal = 0;
            let subjectCols = subjects.map(sub => {
                const record = marks.find(m => m.studentId === s.id && m.subject === sub && m.term === term) || {};
                const score = record.score !== undefined ? record.score :
                    ((record.t1 || record.mid || record.t2 || record.final) ? (record.t1 || 0) + (record.mid || 0) + (record.t2 || 0) + (record.final || 0) : '');
                rowTotal += (parseFloat(score) || 0);
                return `<td><input type="number" class="form-input mark-input" data-subject="${sub}" value="${score}" placeholder="-" style="width:70px; text-align:center;" oninput="Render.calculateGridTotals(this)"></td>`;
            }).join('');

            const avg = subjects.length ? (rowTotal / subjects.length).toFixed(1) : 0;

            return `
                <tr data-student-id="${s.id}">
                    <td style="sticky; left:0; background:white;">S${s.regNumber}</td>
                    <td class="font-bold" style="sticky; left:80px; background:white;">${s.name}</td>
                    ${subjectCols}
                    <td class="row-total font-bold text-primary" style="text-align:center; background:#f8fafc;">${rowTotal}</td>
                    <td class="row-avg font-bold text-primary" style="text-align:center; background:#f8fafc;">${avg}</td>
                </tr>
            `;
        }).join('');
    },

    calculateGridTotals: (input) => {
        const row = input.closest('tr');
        const inputs = row.querySelectorAll('.mark-input');
        const totalCell = row.querySelector('.row-total');
        const avgCell = row.querySelector('.row-avg');

        let total = 0;
        let count = 0;
        inputs.forEach(i => {
            total += (parseFloat(i.value) || 0);
            count++;
        });

        totalCell.innerText = total;
        avgCell.innerText = count ? (total / count).toFixed(1) : 0;
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

        if (editingId) {
            // Update mode
            try {
                studentData.id = editingId;
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
            const maxId = shortIds.length > 0 ? Math.max(...shortIds) : 0;
            studentData.id = Math.max(1, maxId + 1);

            // Auto-generate defaults (Sequential)
            let nextRegNo = 1;
            if (students.length > 0) {
                const maxReg = students.reduce((max, s) => {
                    const num = parseInt(s.regNumber);
                    return !isNaN(num) && num > max ? num : max;
                }, 0);
                nextRegNo = maxReg + 1;
            }

            // Apply Defaults if missing
            if (!studentData.regNumber || studentData.regNumber.trim() === '') {
                studentData.regNumber = nextRegNo.toString();
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
        if (confirm('Are you sure you want to delete this student?')) {
            await db.collection('students').doc(id.toString()).delete();
            // sync will auto-refresh UI
        }
    },

    addStaff: async (e) => {
        e.preventDefault();
        const form = e.target;
        const editingId = Store.cache.editingStaffId;

        // Collect checked subjects
        const checkedSubjects = Array.from(form.querySelectorAll('input[name="subject"]:checked'))
            .map(cb => cb.value);

        if (checkedSubjects.length === 0) {
            return alert('Please select at least one subject');
        }

        // Generate short sequential ID for new members
        const staff = Store.get('staff');
        const shortIds = staff.map(s => parseInt(s.id)).filter(id => !isNaN(id) && id < 10000000);
        const maxId = shortIds.length > 0 ? Math.max(...shortIds) : 999;
        const newId = Math.max(1000, maxId + 1);

        const staffData = {
            id: editingId || newId,
            name: form.name.value,
            role: form.role.value,
            phone: form.phone.value,
            level: document.getElementById('staff-level-select').value,
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
        const staff = Store.get('staff').find(s => s.id == id);
        if (!staff) return;

        Store.cache.editingStaffId = staff.id;
        const form = document.getElementById('add-staff-form');

        // Populate fields
        form.name.value = staff.name;
        form.role.value = staff.role;
        form.phone.value = staff.phone;

        if (staff.level) {
            document.getElementById('staff-level-select').value = staff.level;
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

    readMessage: async (id) => {
        const messages = Store.get('messages');
        const msg = messages.find(m => m.id === id);
        if (msg) {
            await db.collection('messages').doc(id.toString()).update({ read: true });
        }
    },

    deleteAllStudents: async () => {
        if (confirm('CRITICAL WARNING: This will delete ALL student data permanently. This cannot be undone.\n\nAre you sure you want to proceed?')) {
            if (confirm('Please confirm one last time: DELETE ALL STUDENTS?')) {
                const students = Store.get('students');
                const batch = db.batch();
                students.forEach(s => {
                    batch.delete(db.collection('students').doc(s.id.toString()));
                });
                await batch.commit();
                alert('All student data has been cleared.');
            }
        }
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
                <td>S${s.regNumber || s.id}</td>
                <td class="font-bold text-primary">${s.name}</td>
                <td>${s.className || s.grade}</td>
                <td>${s.guardianName || s.parent}</td>
                <td>${s.guardianPhone || '-'}</td>
                <td><span class="badge ${s.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${s.status}</span></td>
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
        const rows = document.querySelectorAll('#marks-table-body tr');
        const batch = db.batch();

        rows.forEach(row => {
            const studentId = row.getAttribute('data-student-id');
            const inputs = row.querySelectorAll('.mark-input');

            inputs.forEach(input => {
                const subject = input.getAttribute('data-subject');
                const score = parseFloat(input.value) || 0;

                const markId = `${studentId}_${subject}_${term}`.replace(/\s+/g, '_');
                const docRef = db.collection('marks').doc(markId);

                batch.set(docRef, {
                    studentId,
                    subject,
                    term,
                    score: score,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        });

        try {
            await batch.commit();
            alert('All Marks Saved to Cloud Successfully!');
        } catch (err) {
            console.error("Batch Marks Save Error:", err);
            alert("Error saving Marks to Cloud: " + err.message);
        }
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

    login: (e) => {
        e.preventDefault();
        const user = document.getElementById('login-username').value;
        const pass = document.getElementById('login-password').value;
        const error = document.getElementById('login-error');

        // Simple default credentials
        if (user === 'admin' && pass === 'admin') {
            Auth.user = { name: 'Admin User', role: 'Administrator' };
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
        Router.navigate('dashboard');
    }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    Store.init();
    Auth.init();

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
    // Bind Staff Registration
    const staffForm = document.getElementById('add-staff-form');
    if (staffForm) staffForm.addEventListener('submit', Actions.addStaff);
});
