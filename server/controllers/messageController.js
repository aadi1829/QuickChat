import Message from "../models/Message.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import cloudinary from "../lib/cloudinary.js"
import { io, userSocketMap } from "../server.js";


// Get all users except the logged in user
export const getUsersForSidebar = async (req, res)=>{
    try {
        const userId = req.user._id;
        const userRole = req.user.role;

        // Filter users who have the opposite role (same roles can't see each other)
        const filteredUsers = await User.find({
            _id: { $ne: userId },
            role: { $ne: userRole } 
        }).select("-password").sort({ createdAt: 1 });

        // Count number of messages not seen
        const unseenMessages = {}
        const promises = filteredUsers.map(async (user)=>{
            const messages = await Message.find({senderId: user._id, receiverId: userId, seen: false})
            if(messages.length > 0){
                unseenMessages[user._id] = messages.length;
            }
        })
        await Promise.all(promises);
        res.json({success: true, users: filteredUsers, unseenMessages})
    } catch (error) {
        console.log(error.message);
        res.status(500).json({success: false, message: error.message})
    }
}

// Get all messages for selected user
export const getMessages = async (req, res) =>{
    try {
        const { id: selectedUserId } = req.params;
        const myId = req.user._id;

        const messages = await Message.find({
            $or: [
                {senderId: myId, receiverId: selectedUserId},
                {senderId: selectedUserId, receiverId: myId},
            ]
        }).sort({ createdAt: 1 });

        // Mark messages as seen
        await Message.updateMany({senderId: selectedUserId, receiverId: myId}, {seen: true});

        const session = await Session.findOne({
            $or: [
                { astrologerId: myId, clientId: selectedUserId },
                { astrologerId: selectedUserId, clientId: myId }
            ]
        });

        res.json({ success: true, messages, sessionStartTime: session?.startTime })


    } catch (error) {
        console.log(error.message);
        res.status(500).json({success: false, message: error.message})
    }
}

// api to mark message as seen using message id
export const markMessageAsSeen = async (req, res)=>{
    try {
        const { id } = req.params;
        const message = await Message.findById(id);
        if (!message) {
            return res.status(404).json({success: false, message: "Message not found"});
        }
        if (message.receiverId.toString() !== req.user._id.toString()) {
            return res.status(403).json({success: false, message: "Not authorized"});
        }
        await Message.findByIdAndUpdate(id, {seen: true});
        res.json({success: true})
    } catch (error) {
        console.log(error.message);
        res.status(500).json({success: false, message: error.message})
    }
}

// Send message to selected user
export const sendMessage = async (req, res) =>{
    try {
        const {text, image} = req.body;
        const receiverId = req.params.id;
        const senderId = req.user._id;
        const senderName = req.user.fullName;
        const senderRole = req.user.role;

        // Fetch receiver details to confirm their role
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ success: false, message: "Receiver not found" });
        }

        // Determine astrologer and client IDs
        const astrologerId = senderRole === "astrologer" ? senderId : receiverId;
        const clientId = senderRole === "client" ? senderId : receiverId;

        // Check for an existing session
        let session = await Session.findOne({ astrologerId, clientId });
        let isNewSession = false;

        // Logic check: Chat initiation and expiry
        if (!session) {
            // Only an astrologer can start the chat
            if (senderRole === "astrologer") {
                session = await Session.create({
                    astrologerId,
                    clientId,
                    startTime: new Date()
                });
                isNewSession = true;
            } else {
                return res.status(403).json({ success: false, message: "Chat must be initiated by the astrologer." });
            }
        } else {
            // If session exists, check if it's expired (3 minutes = 180,000ms)
            const currentTime = new Date();
            const elapsedTime = currentTime - session.startTime;
            if (elapsedTime > 3 * 60 * 1000) {
                return res.status(403).json({ success: false, message: "Chat session has expired. Both users are now blocked from messaging." });
            }
        }

        let imageUrl;
        if(image){
            const uploadResponse = await cloudinary.uploader.upload(image)
            imageUrl = uploadResponse.secure_url;
        }
        const newMessage = await Message.create({
            senderId,
            receiverId,
            text,
            image: imageUrl
        })

        // If this is a brand new session, notify the client immediately so their
        // timer starts and chat unlocks — no refresh required.
        if (isNewSession) {
            const clientSocketId = userSocketMap[clientId.toString()];
            if (clientSocketId) {
                io.to(clientSocketId).emit("sessionStarted", {
                    startTime: session.startTime,
                    astrologerId: astrologerId.toString(),
                    clientId: clientId.toString(),
                });
            }
        }

        // Emit the new message to the receiver's socket
        const receiverSocketId = userSocketMap[receiverId.toString()];
        if (receiverSocketId){
            io.to(receiverSocketId).emit("newMessage", {
                ...newMessage.toObject(),
                senderName
            })
        }

        res.json({success: true, newMessage, sessionStartTime: session.startTime});

    } catch (error) {
        console.log(error.message);
        res.status(500).json({success: false, message: error.message})
    }
}