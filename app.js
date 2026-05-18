import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getDatabase,
  ref as databaseReference,
  push,
  onValue,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCN9hMpHMtMvELr8kBcYDbS7PcgPuOyIgU",
  authDomain: "vichat-ca7b7.firebaseapp.com",
  projectId: "vichat-ca7b7",
  storageBucket: "vichat-ca7b7.firebasestorage.app",
  messagingSenderId: "875788187635",
  appId: "1:875788187635:web:fcc778c857eac74ea5c486"
};

const allowedUsers = {
  "mavika884@gmail.com": "Mavika",
  "eminemreozdilek@gmail.com": "Emin"
};

const allowedEmails = new Set(Object.keys(allowedUsers));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const loginPage = document.querySelector("#login-page");
const chatPage = document.querySelector("#chat-page");

const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email-input");
const passwordInput = document.querySelector("#password-input");
const loginError = document.querySelector("#login-error");

const userLabel = document.querySelector("#user-label");
const logoutButton = document.querySelector("#logout-button");
const notificationButton = document.querySelector("#notification-button");

const messagesContainer = document.querySelector("#messages-container");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const photoInput = document.querySelector("#photo-input");

const messagesReference = databaseReference(database, "rooms/vichat/messages");

let isMessagesListenerStarted = false;
let seenMessageKeys = new Set();
let isInitialMessagesLoaded = false;
let unreadMessageCount = 0;
let currentSignedUser = null;

loginForm.addEventListener("submit", async function handleLogin(event) {
  event.preventDefault();

  loginError.textContent = "";

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!allowedEmails.has(email)) {
    loginError.textContent = "Bu e-posta Vichat için izinli değil.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    passwordInput.value = "";
  } catch (error) {
    loginError.textContent = "Giriş başarısız. E-posta veya şifre hatalı olabilir.";
    console.error(error);
  }
});

logoutButton.addEventListener("click", async function handleLogout() {
  await signOut(auth);
  location.reload();
});

notificationButton.addEventListener("click", requestNotificationPermission);

sendButton.addEventListener("click", sendTextMessage);

messageInput.addEventListener("keydown", function handleMessageInputKeydown(event) {
  if (event.key === "Enter") {
    sendTextMessage();
  }
});

photoInput.addEventListener("change", sendPhotoMessage);

document.addEventListener("visibilitychange", function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    unreadMessageCount = 0;
    updateDocumentTitle();
  }
});

onAuthStateChanged(auth, async function handleAuthStateChanged(user) {
  if (!user) {
    showLoginPage();
    return;
  }

  if (!allowedEmails.has(user.email)) {
    await signOut(auth);
    showLoginPage();
    loginError.textContent = "Bu hesap Vichat için izinli değil.";
    return;
  }

  currentSignedUser = user;
  showChatPage(user);

  if (!isMessagesListenerStarted) {
    startMessagesListener(user);
    isMessagesListenerStarted = true;
  }
});

async function sendTextMessage() {
  const user = auth.currentUser;

  if (!user) {
    return;
  }

  const text = messageInput.value.trim();

  if (text.length === 0) {
    return;
  }

  messageInput.value = "";

  await push(messagesReference, {
    senderUid: user.uid,
    senderEmail: user.email,
    senderName: getDisplayNameFromEmail(user.email),
    type: "text",
    text: text,
    imageData: "",
    createdAt: Date.now()
  });
}

async function sendPhotoMessage(event) {
  const user = auth.currentUser;
  const file = event.target.files[0];

  if (!user || !file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("Lütfen sadece fotoğraf seç.");
    photoInput.value = "";
    return;
  }

  const maximumOriginalFileSizeInBytes = 8 * 1024 * 1024;

  if (file.size > maximumOriginalFileSizeInBytes) {
    alert("Fotoğraf çok büyük. En fazla 8 MB seçebilirsin.");
    photoInput.value = "";
    return;
  }

  try {
    const compressedImageData = await compressImageToBase64(file);

    await push(messagesReference, {
      senderUid: user.uid,
      senderEmail: user.email,
      senderName: getDisplayNameFromEmail(user.email),
      type: "image",
      text: "",
      imageData: compressedImageData,
      createdAt: Date.now()
    });
  } catch (error) {
    console.error(error);
    alert("Fotoğraf gönderilemedi.");
  } finally {
    photoInput.value = "";
  }
}

function startMessagesListener(currentUser) {
  const latestMessagesQuery = query(
    messagesReference,
    orderByChild("createdAt"),
    limitToLast(200)
  );

  onValue(latestMessagesQuery, function handleMessagesSnapshot(snapshot) {
    const messages = [];

    snapshot.forEach(function collectMessage(childSnapshot) {
      messages.push({
        key: childSnapshot.key,
        ...childSnapshot.val()
      });
    });

    messages.sort(function sortByTime(firstMessage, secondMessage) {
      return (firstMessage.createdAt || 0) - (secondMessage.createdAt || 0);
    });

    messagesContainer.innerHTML = "";

    for (const message of messages) {
      renderMessage(message, currentUser.uid);
    }

    if (isInitialMessagesLoaded) {
      for (const message of messages) {
        const isNewMessage = !seenMessageKeys.has(message.key);
        const isFromOtherPerson = message.senderUid !== currentUser.uid;

        if (isNewMessage && isFromOtherPerson) {
          handleIncomingMessageNotification(message);
        }
      }
    }

    seenMessageKeys = new Set(messages.map(function mapMessage(message) {
      return message.key;
    }));

    isInitialMessagesLoaded = true;
  });
}

function renderMessage(message, currentUserUid) {
  const messageRow = document.createElement("div");
  messageRow.classList.add("message-row");

  if (message.senderUid === currentUserUid) {
    messageRow.classList.add("mine");
  } else {
    messageRow.classList.add("other");
  }

  const messageBubble = document.createElement("div");
  messageBubble.classList.add("message-bubble");

  if (message.type === "text") {
    const textElement = document.createElement("div");
    textElement.textContent = message.text;
    messageBubble.appendChild(textElement);
  }

  if (message.type === "image") {
    const imageElement = document.createElement("img");
    imageElement.src = message.imageData;
    imageElement.alt = "Gönderilen fotoğraf";
    messageBubble.appendChild(imageElement);
  }

  const timeElement = document.createElement("div");
  timeElement.classList.add("message-time");
  timeElement.textContent = `${message.senderName || "Kullanıcı"} • ${formatTime(message.createdAt)}`;
  messageBubble.appendChild(timeElement);

  messageRow.appendChild(messageBubble);
  messagesContainer.appendChild(messageRow);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function handleIncomingMessageNotification(message) {
  playNotificationSound();

  if (document.visibilityState !== "visible") {
    unreadMessageCount += 1;
    updateDocumentTitle();
  }

  showSystemNotification(message);
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Bu tarayıcı bildirimleri desteklemiyor.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      alert("Bildirimler açıldı.");
      return;
    }

    if (permission === "denied") {
      alert("Bildirim izni reddedildi.");
      return;
    }

    alert("Bildirim izni verilmedi.");
  } catch (error) {
    console.error(error);
    alert("Bildirim izni alınamadı.");
  }
}

function showSystemNotification(message) {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  if (document.visibilityState === "visible") {
    return;
  }

  const notificationBody =
    message.type === "image"
      ? "Yeni bir fotoğraf gönderildi 📷"
      : message.text;

  const notification = new Notification("Vichat", {
    body: `${message.senderName || "Yeni mesaj"}: ${notificationBody}`,
    tag: "vichat-new-message",
    renotify: true
  });

  notification.onclick = function handleNotificationClick() {
    window.focus();
    notification.close();
  };
}

function playNotificationSound() {
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = "triangle";
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0.04;

    oscillator.start();

    setTimeout(function stopFirstTone() {
      oscillator.frequency.value = 660;
    }, 90);

    setTimeout(function stopSound() {
      oscillator.stop();
      audioContext.close();
    }, 180);
  } catch (error) {
    console.log("Bildirim sesi çalınamadı.", error);
  }
}

function updateDocumentTitle() {
  if (unreadMessageCount > 0) {
    document.title = `(${unreadMessageCount}) Vichat`;
    return;
  }

  document.title = "Vichat";
}

function compressImageToBase64(file) {
  return new Promise(function createCompressedImage(resolve, reject) {
    const reader = new FileReader();

    reader.onload = function handleFileLoaded(event) {
      const image = new Image();

      image.onload = function handleImageLoaded() {
        const maximumWidth = 900;
        const maximumHeight = 900;

        let width = image.width;
        let height = image.height;

        if (width > height && width > maximumWidth) {
          height = Math.round((height * maximumWidth) / width);
          width = maximumWidth;
        }

        if (height >= width && height > maximumHeight) {
          width = Math.round((width * maximumHeight) / height);
          height = maximumHeight;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);

        const jpegQuality = 0.72;
        const compressedBase64 = canvas.toDataURL("image/jpeg", jpegQuality);

        const approximateSizeInBytes = calculateBase64SizeInBytes(compressedBase64);
        const maximumCompressedSizeInBytes = 900 * 1024;

        if (approximateSizeInBytes > maximumCompressedSizeInBytes) {
          reject(new Error("Sıkıştırılmış fotoğraf hâlâ çok büyük."));
          return;
        }

        resolve(compressedBase64);
      };

      image.onerror = function handleImageError() {
        reject(new Error("Fotoğraf okunamadı."));
      };

      image.src = event.target.result;
    };

    reader.onerror = function handleReaderError() {
      reject(new Error("Dosya okunamadı."));
    };

    reader.readAsDataURL(file);
  });
}

function calculateBase64SizeInBytes(base64Text) {
  const base64Content = base64Text.split(",")[1] || "";
  return Math.ceil((base64Content.length * 3) / 4);
}

function showLoginPage() {
  loginPage.classList.remove("hidden");
  chatPage.classList.add("hidden");
  userLabel.textContent = "";
}

function showChatPage(user) {
  loginPage.classList.add("hidden");
  chatPage.classList.remove("hidden");
  userLabel.textContent = `${getDisplayNameFromEmail(user.email)} • ${user.email}`;
}

function getDisplayNameFromEmail(email) {
  return allowedUsers[email] || email || "Kullanıcı";
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}