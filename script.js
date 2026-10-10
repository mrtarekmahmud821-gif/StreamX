import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc,
  onSnapshot, 
  query, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDzaSJuMumdlp_ZzjKvatvGm_7XLxq3jFM",
  authDomain: "link-click-work.firebaseapp.com",
  databaseURL: "https://link-click-work-default-rtdb.firebaseio.com",
  projectId: "link-click-work",
  storageBucket: "link-click-work.firebasestorage.app",
  messagingSenderId: "1098565051426",
  appId: "1:1098565051426:web:a99ee9186b0f481954167b",
  measurementId: "G-PLHRG49TXJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let selectedPackage = null;
let userListener = null;
let expiryCheckInterval = null;

const TARGET_STREAM_URL = "http://172.20.6.10:9056/";

function phoneToEmail(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  return `${clean}@streamx.com`;
}

// ==================== TV REMOTE D-PAD NAVIGATION ENGINE ====================
function getVisibleFocusables() {
  const activeContainer = document.getElementById("mainApp").style.display !== "none" 
    ? document.getElementById("mainApp") 
    : document.querySelector(".overlay-screen:not([style*='display: none'])");

  if (!activeContainer) return [];
  
  return Array.from(activeContainer.querySelectorAll('.focusable, [tabindex="0"]'))
    .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).visibility !== 'hidden');
}

function navigateDPad(direction) {
  const focusables = getVisibleFocusables();
  if (focusables.length === 0) return;

  let current = document.activeElement;
  if (!focusables.includes(current)) {
    focusables[0].focus();
    return;
  }

  const currentRect = current.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2
  };

  let bestCandidate = null;
  let minDistance = Infinity;

  focusables.forEach(el => {
    if (el === current) return;
    const rect = el.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    let isValidDirection = false;
    if (direction === 'UP' && center.y < currentCenter.y - 5) isValidDirection = true;
    if (direction === 'DOWN' && center.y > currentCenter.y + 5) isValidDirection = true;
    if (direction === 'LEFT' && center.x < currentCenter.x - 5) isValidDirection = true;
    if (direction === 'RIGHT' && center.x > currentCenter.x + 5) isValidDirection = true;

    if (isValidDirection) {
      const dist = Math.hypot(center.x - currentCenter.x, center.y - currentCenter.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestCandidate = el;
      }
    }
  });

  if (bestCandidate) {
    bestCandidate.focus();
    bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

document.addEventListener('keydown', (e) => {
  const code = e.keyCode || e.which;

  if (code === 38 || e.key === 'ArrowUp') {
    e.preventDefault();
    navigateDPad('UP');
  } else if (code === 40 || e.key === 'ArrowDown') {
    e.preventDefault();
    navigateDPad('DOWN');
  } else if (code === 37 || e.key === 'ArrowLeft') {
    e.preventDefault();
    navigateDPad('LEFT');
  } else if (code === 39 || e.key === 'ArrowRight') {
    e.preventDefault();
    navigateDPad('RIGHT');
  } else if (code === 13 || e.key === 'Enter') {
    if (document.activeElement && typeof document.activeElement.click === 'function') {
      document.activeElement.click();
    }
  }
});

// ==================== AUTHENTICATION LOGIC ====================
window.switchAuthTab = function(tab) {
  const loginForm = document.getElementById("loginForm");
  const regForm = document.getElementById("registerForm");
  const tabLogin = document.getElementById("tabLoginBtn");
  const tabReg = document.getElementById("tabRegisterBtn");
  document.getElementById("authMessage").innerText = "";

  if (tab === 'login') {
    loginForm.style.display = "block";
    regForm.style.display = "none";
    tabLogin.classList.add("active");
    tabReg.classList.remove("active");
    setTimeout(() => document.getElementById("loginPhone").focus(), 100);
  } else {
    loginForm.style.display = "none";
    regForm.style.display = "block";
    tabReg.classList.add("active");
    tabLogin.classList.remove("active");
    setTimeout(() => document.getElementById("regName").focus(), 100);
  }
};

window.handleRegister = async function(e) {
  e.preventDefault();
  const name = document.getElementById("regName").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  const password = document.getElementById("regPassword").value;
  const msgEl = document.getElementById("authMessage");
  const btn = document.getElementById("regSubmitBtn");

  if (password.length < 6) {
    msgEl.innerText = "Password must be at least 6 characters.";
    return;
  }

  btn.disabled = true;
  msgEl.innerText = "Creating account...";
  const email = phoneToEmail(phone);

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      name: name,
      phone: phone,
      email: email,
      subscription: { status: "expired", expiry: 0 },
      createdAt: serverTimestamp()
    });

    msgEl.style.color = "#38ef7d";
    msgEl.innerText = "Account created successfully!";
  } catch (error) {
    btn.disabled = false;
    msgEl.style.color = "#ff4d4d";
    if (error.code === "auth/email-already-in-use") {
      msgEl.innerText = "An account already exists with this phone number.";
    } else {
      msgEl.innerText = error.message;
    }
  }
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const phone = document.getElementById("loginPhone").value.trim();
  const password = document.getElementById("loginPassword").value;
  const msgEl = document.getElementById("authMessage");
  const btn = document.getElementById("loginSubmitBtn");

  btn.disabled = true;
  msgEl.innerText = "Logging in...";
  const email = phoneToEmail(phone);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    msgEl.style.color = "#38ef7d";
    msgEl.innerText = "Login successful!";
  } catch (error) {
    btn.disabled = false;
    msgEl.style.color = "#ff4d4d";
    msgEl.innerText = "Invalid phone number or password!";
  }
};

window.handleLogout = function() {
  const iframe = document.getElementById("streamFrame");
  if (iframe) iframe.src = "";
  if (userListener) userListener();
  if (expiryCheckInterval) clearInterval(expiryCheckInterval);
  signOut(auth);
};

// ==================== SUBSCRIPTION WATCHER ====================
onAuthStateChanged(auth, (user) => {
  const authScreen = document.getElementById("authScreen");
  const subScreen = document.getElementById("subScreen");
  const mainApp = document.getElementById("mainApp");

  if (userListener) userListener();
  if (expiryCheckInterval) clearInterval(expiryCheckInterval);

  if (user) {
    currentUser = user;
    authScreen.style.display = "none";

    userListener = onSnapshot(doc(db, "users", user.uid), (userDoc) => {
      if (!userDoc.exists()) return;
      
      const userData = userDoc.data();
      const sub = userData?.subscription || {};
      const now = Date.now();

      if (sub.status === "active" && sub.expiry && sub.expiry > now) {
        subScreen.style.display = "none";
        mainApp.style.display = "flex";

        // Load target stream URL into iframe securely
        const iframe = document.getElementById("streamFrame");
        if (iframe && iframe.src !== TARGET_STREAM_URL) {
          iframe.src = TARGET_STREAM_URL;
        }

        if (expiryCheckInterval) clearInterval(expiryCheckInterval);
        expiryCheckInterval = setInterval(() => {
          if (Date.now() >= sub.expiry) {
            clearInterval(expiryCheckInterval);
            updateDoc(doc(db, "users", user.uid), { "subscription.status": "expired" });
            revokeAccess("Your subscription has expired!");
          }
        }, 3000);

      } else {
        revokeAccess("No active subscription found!");
      }
    });

  } else {
    currentUser = null;
    const iframe = document.getElementById("streamFrame");
    if (iframe) iframe.src = "";
    authScreen.style.display = "flex";
    subScreen.style.display = "none";
    mainApp.style.display = "none";
    setTimeout(() => {
      const loginInput = document.getElementById("loginPhone");
      if (loginInput) loginInput.focus();
    }, 200);
  }
});

function revokeAccess(reasonMessage) {
  const iframe = document.getElementById("streamFrame");
  if (iframe) iframe.src = "";
  document.getElementById("mainApp").style.display = "none";
  document.getElementById("subScreen").style.display = "flex";
  if (reasonMessage) {
    document.getElementById("subMessage").innerText = reasonMessage;
  }
  loadPackages();
}

// ==================== PACKAGES & PAYMENT ====================
function loadPackages() {
  const pkgList = document.getElementById("packageList");
  pkgList.innerHTML = "Loading packages...";

  onSnapshot(collection(db, "packages"), (snapshot) => {
    pkgList.innerHTML = "";
    if (snapshot.empty) {
      pkgList.innerHTML = "<p style='color:#888'>No packages available</p>";
      return;
    }

    let firstPkg = null;
    snapshot.forEach((docSnap) => {
      const pkg = docSnap.data();
      const id = docSnap.id;
      if (pkg.active !== false) {
        const card = document.createElement('div');
        card.className = "package-card focusable";
        card.tabIndex = 0;
        card.innerHTML = `
          <div class="package-info">
            <h4>${pkg.name}</h4>
            <p>Duration: ${pkg.durationDays} Days</p>
          </div>
          <div class="package-price">৳${pkg.price}</div>
        `;
        card.onclick = () => selectPackage(id, pkg.name, pkg.price, pkg.durationDays);
        pkgList.appendChild(card);
        if (!firstPkg) firstPkg = card;
      }
    });

    if (firstPkg) {
      setTimeout(() => firstPkg.focus(), 200);
    }
  });
}

window.selectPackage = function(id, name, price, days) {
  selectedPackage = { id, name, price, days };
  document.getElementById("selectedPkgText").innerText = `Package: ${name} (৳${price} - ${days} Days)`;
  document.getElementById("paymentFormBox").style.display = "block";
  setTimeout(() => {
    const trx = document.getElementById("trxIdInput");
    if (trx) trx.focus();
  }, 100);
};

window.cancelPaymentSelect = function() {
  selectedPackage = null;
  document.getElementById("paymentFormBox").style.display = "none";
};

window.submitPaymentRequest = async function() {
  const trxId = document.getElementById("trxIdInput").value.trim();
  const msgEl = document.getElementById("subMessage");

  if (!trxId) {
    alert("Please enter a Transaction ID (TrxID)");
    return;
  }

  try {
    await addDoc(collection(db, "payments"), {
      userId: currentUser.uid,
      userEmail: currentUser.email,
      packageName: selectedPackage.name,
      amount: selectedPackage.price,
      durationDays: selectedPackage.days,
      transactionId: trxId,
      status: "pending",
      timestamp: Date.now()
    });

    alert("Payment submitted! Your subscription will activate once approved.");
    document.getElementById("trxIdInput").value = "";
    cancelPaymentSelect();
  } catch (error) {
    msgEl.innerText = "Error: " + error.message;
  }
};
