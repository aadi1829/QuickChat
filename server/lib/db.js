import mongoose from "mongoose";

// Function to connect to the mongodb database
export const connectDB = async () =>{
    try {
        mongoose.connection.on('connected', ()=> console.log('[DB] Connected to MongoDB'));
        mongoose.connection.on('error', (err) => console.error('[DB] Connection error:', err.message));
        mongoose.connection.on('disconnected', () => console.warn('[DB] Disconnected from MongoDB'));
       await mongoose.connect(`${process.env.MONGODB_URI}/chat-app`)
    } catch (error) {
        console.error("[DB] Failed to connect | uri=%s | %s", process.env.MONGODB_URI ? "(set)" : "(missing)", error.message);
        process.exit(1);
    }
}