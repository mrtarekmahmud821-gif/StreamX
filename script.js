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
  where, 
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
let currentHls = null;
let currentCategory = 'sports';
let currentChannel = null;
let currentChannelElement = null;

let userListener = null;
let expiryCheckInterval = null;

let stallTimeoutTimer = null;
let lastPlayedTime = 0;
let stallCheckInterval = null;

// Format phone into synthetic email
function phoneToEmail(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  return `${clean}@streamx.com`;
}

function showPlayerLoader() {
  const loader = document.getElementById('playerLoader');
  if (loader) loader.style.display = 'flex';
}

function hidePlayerLoader() {
  const loader = document.getElementById('playerLoader');
  if (loader) loader.style.display = 'none';
}

function stopVideoPlayer() {
  const video = document.getElementById('player');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }
  if (stallCheckInterval) clearInterval(stallCheckInterval);
  if (stallTimeoutTimer) clearTimeout(stallTimeoutTimer);
  hidePlayerLoader();
}

// ==================== ANDROID TV D-PAD SPATIAL NAVIGATION ENGINE ====================
function getVisibleFocusables() {
  const activeContainer = document.getElementById("mainApp").style.display !== "none" 
    ? document.getElementById("mainApp") 
    : document.querySelector(".overlay-screen:not([style*='display: none'])");

  if (!activeContainer) return [];
  
  return Array.from(activeContainer.querySelectorAll('.focusable, [tabindex="0"]'))
    .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).visibility !== 'hidden');
}

function navigateDPad(direction) {
  document.body.classList.add("tv-dpad-mode");

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
    if (direction === 'ArrowUp' && center.y < currentCenter.y - 5) isValidDirection = true;
    if (direction === 'ArrowDown' && center.y > currentCenter.y + 5) isValidDirection = true;
    if (direction === 'ArrowLeft' && center.x < currentCenter.x - 5) isValidDirection = true;
    if (direction === 'ArrowRight' && center.x > currentCenter.x + 5) isValidDirection = true;

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

// Keydown Listener for Android TV Remote D-pad
document.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    navigateDPad(e.key);
  } else if (e.key === 'Enter') {
    if (document.activeElement && typeof document.activeElement.click === 'function') {
      document.activeElement.click();
    }
  } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
    // Return focus to Category Bar if pressing Back from Channels/Player
    const firstCat = document.querySelector('.cat-btn');
    if (firstCat) firstCat.focus();
  }
});

// Show Mouse Cursor if mouse is moved
document.addEventListener('mousemove', () => {
  document.body.classList.remove("tv-dpad-mode");
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
  } else {
    loginForm.style.display = "none";
    regForm.style.display = "block";
    tabReg.classList.add("active");
    tabLogin.classList.remove("active");
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
  stopVideoPlayer();
  if (userListener) userListener();
  if (expiryCheckInterval) clearInterval(expiryCheckInterval);
  signOut(auth);
};

// ==================== REALTIME SUBSCRIPTION WATCHER ====================
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

        loadChannels(currentCategory);

        // Auto-focus first category for TV remote on login
        setTimeout(() => {
          const activeCat = document.querySelector('.cat-btn.active');
          if (activeCat) activeCat.focus();
        }, 500);

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
    stopVideoPlayer();
    authScreen.style.display = "flex";
    subScreen.style.display = "none";
    mainApp.style.display = "none";
  }
});

function revokeAccess(reasonMessage) {
  stopVideoPlayer();
  document.getElementById("mainApp").style.display = "none";
  document.getElementById("subScreen").style.display = "flex";
  if (reasonMessage) {
    document.getElementById("subMessage").innerText = reasonMessage;
  }
  loadPackages();
}

// ==================== SUBSCRIPTION & PACKAGES ====================
function loadPackages() {
  const pkgList = document.getElementById("packageList");
  pkgList.innerHTML = "Loading packages...";

  onSnapshot(collection(db, "packages"), (snapshot) => {
    pkgList.innerHTML = "";
    if (snapshot.empty) {
      pkgList.innerHTML = "<p style='color:#888'>No packages available</p>";
      return;
    }

    snapshot.forEach((docSnap) => {
      const pkg = docSnap.data();
      const id = docSnap.id;
      if (pkg.active !== false) {
        pkgList.innerHTML += `
          <div class="package-card focusable" tabindex="0" onclick="selectPackage('${id}', '${pkg.name}', ${pkg.price}, ${pkg.durationDays})">
            <div class="package-info">
              <h4>${pkg.name}</h4>
              <p>Duration: ${pkg.durationDays} Days</p>
            </div>
            <div class="package-price">৳${pkg.price}</div>
          </div>
        `;
      }
    });
  });
}

window.selectPackage = function(id, name, price, days) {
  selectedPackage = { id, name, price, days };
  document.getElementById("selectedPkgText").innerText = `Package: ${name} (৳${price} - ${days} Days)`;
  document.getElementById("paymentFormBox").style.display = "block";
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

// ==================== CHANNELS & PLAYBACK ENGINE ====================
window.selectCategory = function(cat, element) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  element.classList.add('active');
  loadChannels(cat);
};

function loadChannels(category) {
  const list = document.getElementById('channelList');
  const status = document.getElementById('status');
  list.innerHTML = 'Loading channels...';

  const q = query(collection(db, "channels"), where("category", "==", category));

  onSnapshot(q, (snapshot) => {
    list.innerHTML = '';
    
    if (snapshot.empty) {
      list.innerHTML = `<p style="color:#888; grid-column: 1/-1; text-align:center;">No channels found in ${category.toUpperCase()}</p>`;
      status.innerText = `${category.toUpperCase()} • 0 Channels`;
      return;
    }

    let count = 0;
    snapshot.forEach((docSnap) => {
      const ch = docSnap.data();
      if (ch.active !== false) {
        count++;
        const div = document.createElement('div');
        div.className = 'channel focusable';
        div.tabIndex = 0;
        div.innerHTML = `
          ${ch.logo ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none'">` : ''}
          <div class="channel-name">${ch.name}</div>
        `;
        div.onclick = () => playChannel(ch, div);
        list.appendChild(div);
      }
    });

    status.innerText = `${category.toUpperCase()} • ${count} Channels`;
  });
}

function playChannel(ch, element) {
  if (!ch || !ch.url) {
    alert('Stream URL not found');
    return;
  }

  currentChannel = ch;
  currentChannelElement = element;

  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  if (element) element.classList.add('active');

  const video = document.getElementById('player');
  const status = document.getElementById('status');

  status.innerText = 'Playing: ' + ch.name;
  showPlayerLoader();

  if (stallCheckInterval) clearInterval(stallCheckInterval);

  if (Hls.isSupported()) {
    if (currentHls) {
      currentHls.destroy();
    }

    currentHls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 4
    });

    currentHls.loadSource(ch.url);
    currentHls.attachMedia(video);

    currentHls.on(Hls.Events.MANIFEST_PARSED, function () {
      hidePlayerLoader();
      video.play().catch(() => {});
    });

    currentHls.on(Hls.Events.ERROR, function (event, data) {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            showPlayerLoader();
            currentHls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            currentHls.recoverMediaError();
            break;
          default:
            setTimeout(() => playChannel(currentChannel, currentChannelElement), 2000);
            break;
        }
      }
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = ch.url;
    video.play().catch(() => {});
    hidePlayerLoader();
  } else {
    hidePlayerLoader();
    alert("HLS playback is not supported on this browser.");
    return;
  }

  // Auto Refresh Recovery Mechanism
  lastPlayedTime = video.currentTime;
  stallCheckInterval = setInterval(() => {
    if (!video.paused && !video.ended) {
      if (video.currentTime === lastPlayedTime) {
        showPlayerLoader();
        if (!stallTimeoutTimer) {
          stallTimeoutTimer = setTimeout(() => {
            forceReloadCurrentStream();
          }, 6000);
        }
      } else {
        hidePlayerLoader();
        if (stallTimeoutTimer) {
          clearTimeout(stallTimeoutTimer);
          stallTimeoutTimer = null;
        }
      }
      lastPlayedTime = video.currentTime;
    }
  }, 2000);
}

window.forceReloadCurrentStream = function() {
  if (currentChannel) {
    showPlayerLoader();
    playChannel(currentChannel, currentChannelElement);
  }
};
