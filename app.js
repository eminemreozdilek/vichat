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
  onChildAdded,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import {
  getStorage,
  ref as storageReference,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCN9hMpHMtMvELr8kBcYDbS7PcgPuOyIgU",
  authDomain: "vichat-ca7b7.firebaseapp.com",
  projectId: "vichat-ca7b7",
  storageBucket: "vichat-ca7b7.firebasestorage.app",
  messagingSenderId: "875788187635",
  appId: "1:875788187635:web:fcc778c857eac74ea5c486"
};

const allowedEmails = new Set([
  "mavika884@gmail.com",
  "eminemreozdile@gmail.com"
]);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

const loginPage = document.querySelector("#login-page");
const chatPage = document.querySelector("#chat-page");

const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email-input");
const passwordInput = document.querySelector("#password-input");
const loginError = document.querySelector("#login-error");

const userLabel = document.querySelector("#user-label");
const logoutButton = document.querySelector("#logout-button");

const messagesContainer = document.querySelector("#messages-container");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const photoInput = document.querySelector("#photo-input");

const messagesReference = databaseReference(database, "rooms/vichat/messages");

let isMessagesListenerStarted = false;

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

sendButton.addEventListener("click", sendTextMessage);

messageInput.addEventListener("keydown", function handleMessageInputKeydown(event) {
  if (event.key === "Enter") {
    sendTextMessage();
  }
});

photoInput.addEventListener("change", sendPhotoMessage);

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
    type: "text",
    text: text,
    imageUrl: "",
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

  const maximumFileSizeInBytes = 5 * 1024 * 1024;

  if (file.size > maximumFileSizeInBytes) {
    alert("Fotoğraf çok büyük. Maksimum 5 MB yükleyebilirsin.");
    photoInput.value = "";
    return;
  }

  const safeFileName = createSafeFileName(file.name);
  const photoReference = storageReference(
    storage,
    `vichat_photos/${user.uid}/${safeFileName}`
  );

  try {
    await uploadBytes(photoReference, file);

    const imageUrl = await getDownloadURL(photoReference);

    await push(messagesReference, {
      senderUid: user.uid,
      senderEmail: user.email,
      type: "image",
      text: "",
      imageUrl: imageUrl,
      createdAt: Date.now()
    });
  } catch (error) {
    console.error(error);
    alert("Fotoğraf yüklenemedi.");
  } finally {
    photoInput.value = "";
  }
}

function startMessagesListener(currentUser) {
  const latestMessagesQuery = query(
    messagesReference,
    orderByChild("createdAt"),
    limitToLast(150)
  );

  onChildAdded(latestMessagesQuery, function handleNewMessage(snapshot) {
    const message = snapshot.val();
    renderMessage(message, currentUser.uid);
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
    imageElement.src = message.imageUrl;
    imageElement.alt = "Gönderilen fotoğraf";
    messageBubble.appendChild(imageElement);
  }

  const timeElement = document.createElement("div");
  timeElement.classList.add("message-time");
  timeElement.textContent = formatTime(message.createdAt);
  messageBubble.appendChild(timeElement);

  messageRow.appendChild(messageBubble);
  messagesContainer.appendChild(messageRow);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showLoginPage() {
  loginPage.classList.remove("hidden");
  chatPage.classList.add("hidden");
  userLabel.textContent = "";
}

function showChatPage(user) {
  loginPage.classList.add("hidden");
  chatPage.classList.remove("hidden");
  userLabel.textContent = user.email;
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

function createSafeFileName(originalFileName) {
  const cleanedFileName = originalFileName
    .toLowerCase()
    .replaceAll(" ", "_")
    .replace(/[^a-z0-9._-]/g, "");

  return `${Date.now()}_${cleanedFileName}`;
}
