// ============================================================================
// ESFRMS v3.0 - Excellent Stars Foundation Result Management System
// Complete Firebase + Firestore Integration with Real-Time Sync
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyAMufr8mnGSsMplNA9nPNKT_eSEq12AuI4",
  authDomain: "esfrms-da1a8.firebaseapp.com",
  projectId: "esfrms-da1a8",
  storageBucket: "esfrms-da1a8.firebasestorage.app",
  messagingSenderId: "1043292000468",
  appId: "1:1043292000468:web:49a41fe25a74fe1da0eb41",
  measurementId: "G-CPJX2D9X5Z"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================================
// GLOBAL STATE
// ============================================================================

let currentUser = null;
let currentPage = 'login';
let students = [];
let teachers = [];
let allScores = {};
let schoolInfo = {
  name: 'EXCELLENT STARS FOUNDATION INTERNATIONAL SCHOOL',
  address: 'Giri Kpasere, G/Lada, Abuja',
  phone: '09060065313',
  email: 'info@excellentstars.edu.ng',
  motto: 'Good Foundation With A Brighter Future'
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupAuthStateListener();
  registerServiceWorker();
});

function initializeApp() {
  console.log('ESFRMS v3.0 Initializing...');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker registered'))
      .catch(err => console.error('Service Worker registration failed:', err));
  }
}

function setupAuthStateListener() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      await loadUserData();
      showPage('dashboard');
    } else {
      showPage('login');
    }
  });
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function handleLogin() {
  const role = document.getElementById('roleSelect')?.value || 'teacher';
  const email = document.getElementById('emailInput')?.value;
  const password = document.getElementById('passwordInput')?.value;

  if (!email || !password) {
    showToast('Please enter email and password', 'error');
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast('Login successful!');
  } catch (error) {
    showToast('Login failed: ' + error.message, 'error');
  }
}

function handleGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => showToast('Logged in successfully!'))
    .catch(err => showToast('Google login failed: ' + err.message, 'error'));
}

function handleSignup() {
  const email = document.getElementById('signupEmail')?.value;
  const password = document.getElementById('signupPassword')?.value;
  const name = document.getElementById('signupName')?.value;

  if (!email || !password || !name) {
    showToast('Please fill all fields', 'error');
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then(async (result) => {
      await result.user.updateProfile({ displayName: name });
      await createTeacherRecord(result.user);
      showToast('Account created! Please log in.');
      showPage('login');
    })
    .catch(err => showToast('Signup failed: ' + err.message, 'error'));
}

async function createTeacherRecord(user) {
  await db.collection('teachers').doc(user.uid).set({
    name: user.displayName,
    email: user.email,
    role: 'teacher',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function handleLogout() {
  auth.signOut()
    .then(() => {
      currentUser = null;
      showPage('login');
      showToast('Logged out successfully');
    })
    .catch(err => showToast('Logout failed: ' + err.message, 'error'));
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadUserData() {
  try {
    // Load students
    const studentsSnap = await db.collection('students').get();
    students = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Load teachers
    const teachersSnap = await db.collection('teachers').get();
    teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Load scores with real-time sync
    setupRealtimeSync();

    // Update dashboard
    updateDashboard();
  } catch (error) {
    showToast('Error loading data: ' + error.message, 'error');
  }
}

function setupRealtimeSync() {
  db.collection('scores').onSnapshot((snapshot) => {
    allScores = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!allScores[data.studentId]) {
        allScores[data.studentId] = {};
      }
      allScores[data.studentId][data.subject] = data;
    });
    updateDashboard();
  }, error => {
    console.error('Sync error:', error);
  });
}

// ============================================================================
// STUDENT MANAGEMENT
// ============================================================================

async function addStudent() {
  const name = document.getElementById('studentName')?.value;
  const studentClass = document.getElementById('studentClass')?.value;
  const regNumber = document.getElementById('regNumber')?.value;

  if (!name || !studentClass) {
    showToast('Please fill required fields', 'error');
    return;
  }

  try {
    await db.collection('students').add({
      name,
      class: studentClass,
      regNumber,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      photo: ''
    });
    showToast('Student added successfully!');
    await loadUserData();
    clearStudentForm();
  } catch (error) {
    showToast('Error adding student: ' + error.message, 'error');
  }
}

async function deleteStudent(studentId) {
  if (!confirm('Are you sure you want to delete this student?')) return;

  try {
    await db.collection('students').doc(studentId).delete();
    await db.collection('scores').where('studentId', '==', studentId).get()
      .then(snap => {
        snap.forEach(doc => doc.ref.delete());
      });
    showToast('Student deleted');
    await loadUserData();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

// ============================================================================
// SCORE ENTRY
// ============================================================================

async function saveScore(studentId, subject, score, grade) {
  if (!score || score < 0 || score > 100) {
    showToast('Please enter valid score (0-100)', 'error');
    return;
  }

  try {
    const docId = `${studentId}_${subject}`;
    await db.collection('scores').doc(docId).set({
      studentId,
      subject,
      score: parseInt(score),
      grade: calculateGrade(score),
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      enteredBy: currentUser.uid
    }, { merge: true });

    showToast('Score saved!');
    await loadUserData();
  } catch (error) {
    showToast('Error saving score: ' + error.message, 'error');
  }
}

function calculateGrade(score) {
  score = parseInt(score);
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ============================================================================
// REPORT CARD GENERATION
// ============================================================================

function generateReportCard(studentId) {
  const student = students.find(s => s.id === studentId);
  if (!student) {
    showToast('Student not found', 'error');
    return;
  }

  const scores = allScores[studentId] || {};
  const html = generateReportHTML(student, scores);
  
  const win = window.open('', 'Report', 'width=800,height=600');
  win.document.write(html);
  win.document.close();
}

function generateReportHTML(student, scores) {
  const subjects = Object.keys(scores);
  const totalScore = subjects.reduce((sum, subj) => sum + (scores[subj].score || 0), 0);
  const average = subjects.length > 0 ? (totalScore / subjects.length).toFixed(2) : 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Report Card - ${student.name}</title>
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: Georgia, 'Times New Roman', serif; 
          margin: 20px; 
          color: #1f2937; 
          background: #f5f5f5;
        }
        .header { 
          text-align: center; 
          margin-bottom: 30px; 
          border-bottom: 3px double #374151; 
          padding-bottom: 20px; 
          background: white;
          padding: 20px;
          border-radius: 8px;
        }
        .school-name { 
          font-size: 24px; 
          font-weight: bold; 
          color: #16a34a; 
          text-transform: uppercase; 
          letter-spacing: 1px;
        }
        .school-addr { 
          font-size: 11px; 
          color: #666; 
          margin-top: 8px;
          text-transform: uppercase;
        }
        .school-motto { 
          font-size: 12px; 
          margin-top: 8px; 
          color: #16a34a;
          font-weight: bold;
        }
        .student-info { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 20px; 
          margin-bottom: 20px; 
          background: white;
          padding: 20px;
          border-radius: 8px;
        }
        .info-item { font-size: 13px; }
        .info-label { font-weight: bold; color: #374151; }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 20px; 
          background: white;
          border-radius: 8px;
          overflow: hidden;
        }
        th { 
          background: #374151; 
          color: white; 
          padding: 12px; 
          text-align: left; 
          font-weight: bold; 
          font-size: 12px; 
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        td { 
          padding: 10px; 
          border-bottom: 1px solid #e3e6ea; 
          font-size: 13px; 
        }
        .subject-name { 
          font-weight: 700; 
          color: #374151;
        }
        .score { 
          text-align: center; 
          font-weight: 700;
          color: #16a34a;
        }
        .grade { 
          text-align: center; 
          font-weight: 800; 
          color: #16a34a; 
          font-size: 14px; 
        }
        .total-row { 
          background: #f3f4f6; 
          font-weight: bold; 
        }
        .print-buttons { 
          text-align: center; 
          margin: 20px 0; 
          no-print: true;
        }
        .btn { 
          padding: 10px 20px; 
          margin: 5px; 
          background: #374151; 
          color: white; 
          border: none; 
          border-radius: 5px; 
          cursor: pointer; 
          font-weight: bold; 
          font-size: 14px;
        }
        .btn:hover { 
          background: #16a34a; 
        }
        @media print {
          .print-buttons { display: none; }
          body { margin: 0; background: white; }
          .header, .student-info, table { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="print-buttons">
        <button class="btn" onclick="window.print()">🖨️ Print</button>
        <button class="btn" onclick="window.close()">Close</button>
      </div>

      <div class="header">
        <div class="school-name">${schoolInfo.name}</div>
        <div class="school-addr">${schoolInfo.address}</div>
        <div class="school-motto">${schoolInfo.motto}</div>
        <h2 style="margin: 15px 0 10px 0; font-size: 18px; color: #16a34a;">STUDENT REPORT CARD</h2>
      </div>

      <div class="student-info">
        <div class="info-item">
          <span class="info-label">Student Name:</span><br>${student.name}
        </div>
        <div class="info-item">
          <span class="info-label">Class:</span><br>${student.class || 'N/A'}
        </div>
        <div class="info-item">
          <span class="info-label">Registration No:</span><br>${student.regNumber || 'N/A'}
        </div>
        <div class="info-item">
          <span class="info-label">Date Generated:</span><br>${new Date().toLocaleDateString()}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 50%;">Subject</th>
            <th style="width: 25%;">Score</th>
            <th style="width: 25%;">Grade</th>
          </tr>
        </thead>
        <tbody>
          ${subjects.map(subj => `
            <tr>
              <td class="subject-name">${subj}</td>
              <td class="score">${scores[subj].score}</td>
              <td class="grade">${scores[subj].grade}</td>
            </tr>
          `).join('')}
          ${subjects.length > 0 ? `
            <tr class="total-row">
              <td>TOTAL / AVERAGE</td>
              <td class="score">${totalScore}</td>
              <td class="grade">${average}</td>
            </tr>
          ` : ''}
        </tbody>
      </table>

      <div style="margin-top: 40px; display: flex; justify-content: space-between; background: white; padding: 20px; border-radius: 8px;">
        <div style="text-align: center;">
          <div style="border-top: 1px solid #333; margin-top: 30px; width: 150px; font-weight: bold;">Class Teacher</div>
        </div>
        <div style="text-align: center;">
          <div style="border-top: 1px solid #333; margin-top: 30px; width: 150px; font-weight: bold;">Head of School</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ============================================================================
// BULK PRINT - ENTIRE CLASS
// ============================================================================

function printEntireClass() {
  const classname = document.getElementById('filterClass')?.value;
  if (!classname) {
    showToast('Please select a class', 'error');
    return;
  }

  const classStudents = students.filter(s => s.class === classname);
  if (classStudents.length === 0) {
    showToast('No students in this class', 'error');
    return;
  }

  const subjects = new Set();
  Object.values(allScores).forEach(studentScores => {
    Object.keys(studentScores).forEach(subj => subjects.add(subj));
  });

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Class Report - ${classname}</title>
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: Georgia, 'Times New Roman', serif; 
          margin: 15mm; 
          color: #1f2937; 
          background: #f5f5f5;
        }
        .header { 
          text-align: center; 
          margin-bottom: 20px; 
          border-bottom: 3px double #374151; 
          padding-bottom: 15px; 
          page-break-after: avoid;
          background: white;
          padding: 20px;
          border-radius: 8px;
        }
        .school-name { 
          font-size: 20px; 
          font-weight: bold; 
          color: #16a34a; 
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .class-title { 
          font-size: 16px; 
          font-weight: bold; 
          margin-top: 10px; 
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 30px; 
          page-break-inside: avoid;
          background: white;
          border-radius: 8px;
          overflow: hidden;
        }
        th { 
          background: #374151; 
          color: white; 
          padding: 10px; 
          text-align: left; 
          font-weight: bold; 
          font-size: 11px; 
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        td { 
          padding: 8px; 
          border-bottom: 1px solid #e3e6ea; 
          font-size: 12px; 
        }
        .student-name { 
          font-weight: 700;
          color: #374151;
        }
        .score { 
          text-align: center; 
          font-weight: 700;
          color: #16a34a;
        }
        .grade { 
          text-align: center; 
          font-weight: 800; 
          color: #16a34a; 
        }
        .print-buttons { 
          text-align: center; 
          margin: 20px 0; 
        }
        .btn { 
          padding: 10px 20px; 
          margin: 5px; 
          background: #374151; 
          color: white; 
          border: none; 
          border-radius: 5px; 
          cursor: pointer; 
          font-weight: bold; 
          font-size: 14px;
        }
        .btn:hover { 
          background: #16a34a; 
        }
        @media print {
          .print-buttons { display: none; }
          body { margin: 10mm; background: white; }
          .page-break { page-break-before: always; }
        }
      </style>
    </head>
    <body>
      <div class="print-buttons">
        <button class="btn" onclick="window.print()">🖨️ Print All</button>
        <button class="btn" onclick="window.close()">Close</button>
      </div>

      <div class="header">
        <div class="school-name">${schoolInfo.name}</div>
        <div class="class-title">Class: ${classname}</div>
        <div style="font-size: 10px; color: #666; margin-top: 5px;">${new Date().toLocaleDateString()}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Student</th>
            <th style="width: 15%;">Reg No</th>
            ${Array.from(subjects).map(s => `<th style="width: 10%; text-align: center;"><strong>${s}</strong></th>`).join('')}
            <th style="width: 12%;">Average</th>
          </tr>
        </thead>
        <tbody>
          ${classStudents.map(student => {
            const scores = allScores[student.id] || {};
            const subjectsList = Array.from(subjects);
            const avg = subjectsList.length > 0 ? (subjectsList.reduce((s, subj) => s + (scores[subj]?.score || 0), 0) / subjectsList.length).toFixed(1) : 0;
            return `
              <tr>
                <td class="student-name">${student.name}</td>
                <td>${student.regNumber || '-'}</td>
                ${subjectsList.map(subj => `<td class="score">${scores[subj]?.score || '-'}</td>`).join('')}
                <td class="grade"><strong>${avg}</strong></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div style="text-align: center; margin-top: 40px; font-size: 11px; color: #666; background: white; padding: 15px; border-radius: 8px;">
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `;

  const win = window.open('', 'ClassReport', 'width=1000,height=600');
  win.document.write(html);
  win.document.close();
}

// ============================================================================
// PRINT SELECTION DIALOG
// ============================================================================

function showPrintOptions() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h2 style="margin-top: 0; color: #374151;">Print Options</h2>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 10px;">
          <input type="radio" name="printType" value="individual" checked> 📄 Print Individual Student
        </label>
        <label style="display: block; margin-bottom: 10px;">
          <input type="radio" name="printType" value="class"> 📚 Print Entire Class
        </label>
        <label style="display: block;">
          <input type="radio" name="printType" value="selected"> 📋 Print Selected Students
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="this.parentElement.parentElement.parentElement.remove()">Cancel</button>
        <button class="btn btn-primary" onclick="executePrint(document.querySelector('input[name=printType]:checked').value)">Print</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function executePrint(type) {
  const modal = document.querySelector('.modal-overlay');
  if (modal) modal.remove();
  
  if (type === 'individual') {
    const studentId = prompt('Enter Student ID (or select from list):');
    if (studentId) generateReportCard(studentId);
  } else if (type === 'class') {
    showClassPrintDialog();
  }
}

function showClassPrintDialog() {
  const classes = [...new Set(students.map(s => s.class))];
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h2 style="margin-top: 0; color: #374151;">Select Class to Print</h2>
      <select id="classToPrint" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1.5px solid #e3e6ea; border-radius: 8px;">
        <option value="">Choose a class...</option>
        ${classes.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="this.parentElement.parentElement.parentElement.remove()">Cancel</button>
        <button class="btn btn-primary" onclick="printClassFromDialog()">Print Class</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function printClassFromDialog() {
  const classname = document.getElementById('classToPrint')?.value;
  document.querySelector('.modal-overlay')?.remove();
  
  if (!classname) {
    showToast('Please select a class', 'error');
    return;
  }
  
  const classStudents = students.filter(s => s.class === classname);
  if (classStudents.length === 0) {
    showToast('No students in this class', 'error');
    return;
  }

  const subjects = new Set();
  Object.values(allScores).forEach(studentScores => {
    Object.keys(studentScores).forEach(subj => subjects.add(subj));
  });

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Class Report - ${classname}</title>
      <style>
        * { box-sizing: border-box; }
        body { 
          font-family: Georgia, 'Times New Roman', serif; 
          margin: 15mm; 
          color: #1f2937; 
          background: #f5f5f5;
        }
        .header { 
          text-align: center; 
          margin-bottom: 20px; 
          border-bottom: 3px double #374151; 
          padding-bottom: 15px; 
          page-break-after: avoid;
          background: white;
          padding: 20px;
          border-radius: 8px;
        }
        .school-name { 
          font-size: 20px; 
          font-weight: bold; 
          color: #16a34a; 
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .class-title { 
          font-size: 16px; 
          font-weight: bold; 
          margin-top: 10px; 
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 30px; 
          page-break-inside: avoid;
          background: white;
          border-radius: 8px;
          overflow: hidden;
        }
        th { 
          background: #374151; 
          color: white; 
          padding: 10px; 
          text-align: left; 
          font-weight: bold; 
          font-size: 11px; 
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        td { 
          padding: 8px; 
          border-bottom: 1px solid #e3e6ea; 
          font-size: 12px; 
        }
        .student-name { 
          font-weight: 700;
          color: #374151;
        }
        .score { 
          text-align: center; 
          font-weight: 700;
          color: #16a34a;
        }
        .grade { 
          text-align: center; 
          font-weight: 800; 
          color: #16a34a; 
        }
        .print-buttons { 
          text-align: center; 
          margin: 20px 0; 
        }
        .btn { 
          padding: 10px 20px; 
          margin: 5px; 
          background: #374151; 
          color: white; 
          border: none; 
          border-radius: 5px; 
          cursor: pointer; 
          font-weight: bold; 
          font-size: 14px;
        }
        .btn:hover { 
          background: #16a34a; 
        }
        @media print {
          .print-buttons { display: none; }
          body { margin: 10mm; background: white; }
        }
      </style>
    </head>
    <body>
      <div class="print-buttons">
        <button class="btn" onclick="window.print()">🖨️ Print All</button>
        <button class="btn" onclick="window.close()">Close</button>
      </div>

      <div class="header">
        <div class="school-name">${schoolInfo.name}</div>
        <div class="class-title">Class: ${classname}</div>
        <div style="font-size: 10px; color: #666; margin-top: 5px;">${new Date().toLocaleDateString()}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Student</th>
            <th style="width: 15%;">Reg No</th>
            ${Array.from(subjects).map(s => `<th style="width: 10%; text-align: center;"><strong>${s}</strong></th>`).join('')}
            <th style="width: 12%;">Average</th>
          </tr>
        </thead>
        <tbody>
          ${classStudents.map(student => {
            const scores = allScores[student.id] || {};
            const subjectsList = Array.from(subjects);
            const avg = subjectsList.length > 0 ? (subjectsList.reduce((s, subj) => s + (scores[subj]?.score || 0), 0) / subjectsList.length).toFixed(1) : 0;
            return `
              <tr>
                <td class="student-name">${student.name}</td>
                <td>${student.regNumber || '-'}</td>
                ${subjectsList.map(subj => `<td class="score">${scores[subj]?.score || '-'}</td>`).join('')}
                <td class="grade"><strong>${avg}</strong></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div style="text-align: center; margin-top: 40px; font-size: 11px; color: #666; background: white; padding: 15px; border-radius: 8px;">
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `;

  const win = window.open('', 'ClassReport', 'width=1000,height=600');
  win.document.write(html);
  win.document.close();
}

// ============================================================================
// DASHBOARD
// ============================================================================

function updateDashboard() {
  const totalStudents = students.length;
  const totalScores = Object.values(allScores).reduce((sum, scores) => sum + Object.keys(scores).length, 0);
  const avgScore = totalScores > 0 ? (Object.values(allScores).reduce((sum, scores) => 
    sum + Object.values(scores).reduce((s, sc) => s + (sc.score || 0), 0), 0) / totalScores).toFixed(1) : 0;
  
  const dashboardHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon icon-blue">👥</div>
        <div class="stat-value">${totalStudents}</div>
        <div class="stat-label">Total Students</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-green">✏️</div>
        <div class="stat-value">${totalScores}</div>
        <div class="stat-label">Scores Recorded</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-navy">📈</div>
        <div class="stat-value">${avgScore}%</div>
        <div class="stat-label">Average Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-green">📋</div>
        <div class="stat-value">${students.filter(s => Object.keys(allScores[s.id] || {}).length > 0).length}</div>
        <div class="stat-label">Report Cards</div>
      </div>
    </div>
  `;

  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = dashboardHTML;
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showPage(page) {
  currentPage = page;
  const app = document.getElementById('app');
  
  if (page === 'login') {
    app.innerHTML = getLoginHTML();
  } else if (page === 'dashboard') {
    app.innerHTML = getDashboardHTML();
  }
}

function getLoginHTML() {
  return `
    <div class="login-page">
      <div class="login-topbar">
        <div class="contact-item">📞 ${schoolInfo.phone}</div>
        <div class="contact-item">✉️ ${schoolInfo.email}</div>
        <div class="login-tagline">${schoolInfo.motto}</div>
      </div>
      <div class="login-shell">
        <div class="login-brand-panel">
          <div class="brand-crest-badge">
            <img src="icon-192.png" alt="ESFRMS Logo">
          </div>
          <h1 class="brand-panel-title">${schoolInfo.name}</h1>
          <div class="brand-gold-divider">📚</div>
          <p class="brand-panel-sub">Result Management System</p>
        </div>
        <div class="login-form-panel">
          <div class="login-form-inner">
            <div class="secure-badge-row">🔒 Secure Access</div>
            <div class="secure-badge-sub">Sign in to continue</div>
            <h2 class="welcome-heading">Welcome <span class="accent">Back!</span></h2>
            <div class="gold-star-divider">⭐</div>
            <div class="auth-card">
              <div class="auth-card-head">
                <div class="auth-avatar">👤</div>
                <div class="auth-heading">Sign In</div>
              </div>
              <div class="field">
                <label>Email Address</label>
                <div class="input-icon-wrap">
                  <input type="email" id="emailInput" placeholder="your@email.com" onkeypress="if(event.key==='Enter')handleLogin()">
                </div>
              </div>
              <div class="field">
                <label>Password</label>
                <div class="input-icon-wrap">
                  <input type="password" id="passwordInput" placeholder="••••••••" onkeypress="if(event.key==='Enter')handleLogin()">
                </div>
              </div>
              <button class="btn-login" onclick="handleLogin()">🔓 LOGIN TO DASHBOARD</button>
              <div class="divider-row">OR</div>
              <button class="btn-google" onclick="handleGoogleLogin()">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/></svg>
                Sign in with Google
              </button>
            </div>
            <p style="text-align: center; font-size: 12px; margin-top: 16px; color: var(--text-dim);">
              New teacher? <a href="#" onclick="alert('Contact your school administrator to create an account.')" style="color: var(--green-2); font-weight: 700;">Create your account</a>
            </p>
          </div>
        </div>
      </div>
      <div class="stripe-band"></div>
    </div>
  `;
}

function getDashboardHTML() {
  const classes = [...new Set(students.map(s => s.class))];
  return `
    <div class="shell">
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-crest">
            <img src="icon-192.png" alt="Logo">
          </div>
          <div class="sidebar-school">EXCELLENT STARS</div>
          <div class="sidebar-tag">Result Management System</div>
          <div class="sidebar-role-badge">ADMIN</div>
        </div>

        <div class="menu-label">MAIN MENU</div>
        <button class="menu-item active" onclick="showDashboard()">📊 Dashboard</button>
        <button class="menu-item" onclick="showStudentManagement()">👥 Student Register</button>
        <button class="menu-item" onclick="showScoreEntry()">✏️ Score Entry</button>
        <button class="menu-item" onclick="showReportCard()">📋 Report Card</button>
        <button class="menu-item" onclick="showPrintOptions()">🖨️ Print Center</button>

        <div class="sidebar-footer">
          <div class="admin-row">
            <div class="admin-avatar">${currentUser.displayName?.[0] || 'A'}</div>
            <div>
              <div class="admin-name">${currentUser.displayName || 'Admin'}</div>
              <div class="admin-email">${currentUser.email}</div>
            </div>
          </div>
          <button class="signout-btn" onclick="handleLogout()">🚪 Sign Out</button>
        </div>
      </div>

      <div class="main">
        <div class="topbar">
          <button class="hamburger" onclick="toggleSidebar()">☰</button>
          <h1 class="page-title">Dashboard</h1>
        </div>
        <div class="content" id="content"></div>
      </div>
    </div>
    <div class="overlay" id="overlay" onclick="closeSidebar()"></div>
  `;
}

function showToast(message, type = 'info') {
  const zone = document.getElementById('toast-zone');
  if (!zone) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  zone.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function showDashboard() {
  updateDashboard();
}

function showStudentManagement() {
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = `
      <div class="card">
        <h2 class="card-title">👥 Student Management</h2>
        <div class="field">
          <label>Student Name</label>
          <input type="text" id="studentName" placeholder="Enter full name">
        </div>
        <div class="field">
          <label>Class</label>
          <input type="text" id="studentClass" placeholder="e.g., JSS1, SS2">
        </div>
        <div class="field">
          <label>Registration Number</label>
          <input type="text" id="regNumber" placeholder="e.g., ESF-001">
        </div>
        <button class="btn btn-primary btn-block" onclick="addStudent()">➕ Add Student</button>
      </div>
      <div class="card">
        <h2 class="card-title">📋 All Students (${students.length})</h2>
        ${students.length > 0 ? students.map(s => `
          <div class="list-row">
            <div class="row-avatar">${s.name[0]}</div>
            <div class="row-main">
              <div class="row-name">${s.name}</div>
              <div class="row-meta">Class: ${s.class} | Reg: ${s.regNumber || 'N/A'}</div>
            </div>
            <div class="row-actions">
              <button class="icon-btn" onclick="deleteStudent('${s.id}')">🗑️</button>
            </div>
          </div>
        `).join('') : '<div style="text-align: center; padding: 20px; color: #666;">No students added yet</div>'}
      </div>
    `;
  }
}

function showScoreEntry() {
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = `
      <div class="card">
        <h2 class="card-title">✏️ Score Entry</h2>
        <div class="field">
          <label>Student</label>
          <select id="scoreStudentSelect">
            <option value="">Select Student</option>
            ${students.map(s => `<option value="${s.id}">${s.name} (${s.class})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Subject</label>
          <input type="text" id="scoreSubject" placeholder="e.g., English, Mathematics">
        </div>
        <div class="field">
          <label>Score (0-100)</label>
          <input type="number" id="scoreValue" min="0" max="100" placeholder="Enter score">
        </div>
        <button class="btn btn-primary btn-block" onclick="saveScoreFromForm()">💾 Save Score</button>
      </div>
      <div class="card">
        <h2 class="card-title">📊 Recent Scores (${Object.values(allScores).reduce((s, sc) => s + Object.keys(sc).length, 0)})</h2>
        ${Object.keys(allScores).length > 0 ? `
          <table class="score-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Subject</th>
                <th>Score</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(allScores).slice(0, 20).map(([studId, scores]) => {
                const student = students.find(s => s.id === studId);
                return Object.entries(scores).map(([subj, score]) => `
                  <tr>
                    <td><strong>${student?.name || 'Unknown'}</strong></td>
                    <td><strong>${subj}</strong></td>
                    <td>${score.score}</td>
                    <td><strong style="color: #16a34a;">${score.grade}</strong></td>
                  </tr>
                `).join('');
              }).join('')}
            </tbody>
          </table>
        ` : '<div style="text-align: center; padding: 20px; color: #666;">No scores entered yet</div>'}
      </div>
    `;
  }
}

function saveScoreFromForm() {
  const studentId = document.getElementById('scoreStudentSelect')?.value;
  const subject = document.getElementById('scoreSubject')?.value;
  const score = document.getElementById('scoreValue')?.value;

  if (!studentId || !subject || !score) {
    showToast('Please fill all fields', 'error');
    return;
  }

  saveScore(studentId, subject, score);
  document.getElementById('scoreSubject').value = '';
  document.getElementById('scoreValue').value = '';
}

function showReportCard() {
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = `
      <div class="card">
        <h2 class="card-title">📋 Generate Report Card</h2>
        <div class="field">
          <label>Select Student</label>
          <select id="reportStudentSelect">
            <option value="">Choose Student</option>
            ${students.map(s => `<option value="${s.id}">${s.name} (${s.class})</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary btn-block" onclick="generateReportCardFromSelect()">📄 Generate Report</button>
      </div>
    `;
  }
}

function generateReportCardFromSelect() {
  const studentId = document.getElementById('reportStudentSelect')?.value;
  if (!studentId) {
    showToast('Please select a student', 'error');
    return;
  }
  generateReportCard(studentId);
}

function clearStudentForm() {
  document.getElementById('studentName').value = '';
  document.getElementById('studentClass').value = '';
  document.getElementById('regNumber').value = '';
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ============================================================================
// KEYBOARD SHORTCUTS & AUTO-SYNC
// ============================================================================

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSidebar();
  }
});

// Auto-sync every 30 seconds
setInterval(() => {
  if (currentUser && currentPage === 'dashboard') {
    setupRealtimeSync();
  }
}, 30000);

console.log('🚀 ESFRMS v3.0 loaded - Firebase + Firestore integration active');
