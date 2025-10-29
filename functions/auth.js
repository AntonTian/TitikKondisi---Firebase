const express = require("express");
const { admin, db } = require("./firebase");

const router = express.Router();

// register
router.post("/register", async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return res.status(400).json({
        message: "All parameters (email, password, confirm password) are required!",
      });
    }

    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format. Only @gmail.com allowed!",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password length must be at least 8 characters!",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Confirm password doesn't match the password above!",
      });
    }

    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      return res.status(400).json({
        message: "Email already registered",
      });
    }

    await userRef.set({
      email,
      password, 
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: err.message });
  }
});

//login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email & password are required!",
      });
    }

    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format. Only @gmail.com allowed!",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password length must be at least 8 characters!",
      });
    }

    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (!userDoc.exists || userDoc.data().password !== password) {
      return res.status(401).json({
        message: "Wrong email or password!",
      });
    }

    res.status(200).json({ message: "Login successful" });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
