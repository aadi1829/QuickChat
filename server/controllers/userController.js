import { generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js"

// Signup a new user
export const signup = async (req, res)=>{
    const { fullName, email, password, bio, role } = req.body;

    try {
        if (!fullName || !email || !password || !bio || !role){
            return res.status(400).json({success: false, message: "Missing Details" })
        }

        if (!["astrologer", "client"].includes(role)) {
            return res.status(400).json({success: false, message: "Invalid role. Must be 'astrologer' or 'client'." });
        }

        // --- NEW: Limit astrologer registrations to 2 ---
        if (role === "astrologer") {
            const astrologerCount = await User.countDocuments({ role: "astrologer" });
            if (astrologerCount >= 2) {
                return res.status(403).json({ success: false, message: "Registration limit reached: only 2 astrologers are allowed." });
            }
        }
        // ----------------------------------------------

        const user = await User.findOne({email});

        if(user){
            return res.json({success: false, message: "Account already exists" })
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            fullName, email, password: hashedPassword, bio, role
        });

        const token = generateToken(newUser._id)

        res.json({success: true, userData: newUser, token, message: "Account created successfully"})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}

// Controller to login a user
export const login = async (req, res) =>{
    try {
        const { email, password } = req.body;
        const userData = await User.findOne({email})

        if (!userData) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, userData.password);

        if (!isPasswordCorrect){
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const token = generateToken(userData._id)

        // Exclude password from response
        const { password: _, ...userWithoutPassword } = userData.toObject();

        res.json({success: true, userData: userWithoutPassword, token, message: "Login successful"})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}
// Controller to check if user is authenticated
export const checkAuth = (req, res)=>{
    res.json({success: true, user: req.user});
}

// Controller to update user profile details
export const updateProfile = async (req, res)=>{
    try {
        const { profilePic, bio, fullName } = req.body;

        const userId = req.user._id;
        let updatedUser;

        if(!profilePic){
            updatedUser = await User.findByIdAndUpdate(userId, {bio, fullName}, {new: true});
        } else{
            const upload = await cloudinary.uploader.upload(profilePic);

            updatedUser = await User.findByIdAndUpdate(userId, {profilePic: upload.secure_url, bio, fullName}, {new: true});
        }
        res.json({success: true, user: updatedUser})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}