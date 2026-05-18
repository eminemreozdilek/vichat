import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getDatabase,
  ref as databaseRef,
  push,
  onChildAdded,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

const loginForm = document.querySelector("#login-form");
const chatBox = document.querySelector("#chat-box");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const photoInput = document.querySelector("#photo-input");
const logoutButton = document.querySelector("#logout-button");

const messagesRef = databaseRef(database, "rooms/vichat/messages");

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.querySelector("#email").value;
  const password = document.querySelector("#password").value;

  await signInWithEmailAndPassword(auth, email, password);
});

sendButton.addEventListener("click", async () => {
  const user = auth.currentUser;
  const text = messageInput.value.trim();

  if (!user || text.length === 0) {
    return;
  }

  await push(messagesRef, {
    senderUid: user.uid,
    type: "text",
    text,
    imageUrl: "",
    createdAt: Date.now()
  });

  messageInput.value = "";
});

photoInput.addEventListener("change", async event => {
  const user = auth.currentUser;
  const file = event.target.files[0];

  if (!user || !file) {
    return;
  }

  const safeFileName = `${Date.now()}_${file.name}`;
  const imageStorageRef = storageRef(
    storage,
    `vichat_photos/${user.uid}/${safeFileName}`
  );

  await uploadBytes(imageStorageRef, file);
  const imageUrl = await getDownloadURL(imageStorageRef);

  await push(messagesRef, {
    senderUid: user.uid,
    type: "image",
    text: "",
    imageUrl,
    createdAt: Date.now()
  });

  photoInput.value = "";
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, user => {
  if (!user) {
    document.body.classList.remove("logged-in");
    return;
  }

  document.body.classList.add("logged-in");

  const recentMessagesQuery = query(
    messagesRef,
    orderByChild("createdAt"),
    limitToLast(100)
  );

  onChildAdded(recentMessagesQuery, snapshot => {
    const message = snapshot.val();
    renderMessage(message, user.uid);
  });
});

function renderMessage(message, currentUid) {
  const messageElement = document.createElement("div");
  messageElement.className =
    message.senderUid === currentUid ? "message mine" : "message hers";

  if (message.type === "text") {
    messageElement.textContent = message.text;
  }

  if (message.type === "image") {
    const image = document.createElement("img");
    image.src = message.imageUrl;
    image.alt = "Shared photo";
    messageElement.appendChild(image);
  }

  chatBox.appendChild(messageElement);
  chatBox.scrollTop = chatBox.scrollHeight;
}
