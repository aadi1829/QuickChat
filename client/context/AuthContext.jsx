import { createContext, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

axios.defaults.baseURL = backendUrl;
// Always send cookies with every request
axios.defaults.withCredentials = true;

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [authUser, setAuthUser] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [socket, setSocket] = useState(null);
    // Keep a copy of the access token in memory (NOT localStorage) for socket auth
    const [accessToken, setAccessToken] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Silently refresh the access token using the HttpOnly refresh cookie
    const refreshToken = async () => {
        try {
            const { data } = await axios.post("/api/auth/refresh");
            if (data.success) {
                setAccessToken(data.token);
                axios.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
                return data.token;
            }
        } catch {
            // Refresh failed — user must log in again
        }
        return null;
    };

    // Check auth on mount — uses the HttpOnly access token cookie
    const checkAuth = async () => {
        try {
            const { data } = await axios.get("/api/auth/check");
            if (data.success) {
                setAuthUser(data.user);
                const token = await refreshToken();
                connectSocket(data.user, token);
            }
        } catch (error) {
            // 401 is expected when not logged in — don't toast for it
            if (error?.response?.status !== 401) {
                toast.error(error.message);
            }
        }
    };

    const login = async (state, credentials) => {
        try {
            setIsLoading(true);
            const { data } = await axios.post(`/api/auth/${state}`, credentials);
            if (data.success) {
                setAuthUser(data.userData);
                setAccessToken(data.token);
                axios.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
                connectSocket(data.userData, data.token);
                toast.success(data.message);
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            const resData = error?.response?.data;
            if (resData?.errors?.length) {
                toast.error(resData.errors[0].msg);
            } else {
                toast.error(resData?.message || error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await axios.post("/api/auth/logout");
        } catch {
            // Best-effort server-side cookie clear
        }
        setAuthUser(null);
        setAccessToken(null);
        setOnlineUsers([]);
        delete axios.defaults.headers.common["Authorization"];
        toast.success("Logged out successfully");
        if (socket) socket.disconnect();
        setSocket(null);
    };

    const updateProfile = async (body) => {
        try {
            const { data } = await axios.put("/api/auth/update-profile", body);
            if (data.success) {
                setAuthUser(data.user);
                toast.success("Profile updated successfully");
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    // Connect socket — send access token via socket auth (not query param)
    const connectSocket = (userData, token) => {
        if (!userData) return;
        // Clean up any stale socket before creating a new one
        setSocket(prev => {
            if (prev) {
                prev.off();
                prev.disconnect();
            }
            return prev;
        });
        const newSocket = io(backendUrl, {
            withCredentials: true,
            auth: { token },
        });
        newSocket.connect();
        setSocket(newSocket);

        newSocket.on("getOnlineUsers", (userIds) => {
            setOnlineUsers(userIds);
        });
    };

    useEffect(() => {
        // On mount: try to restore session via cookie (no localStorage token)
        checkAuth();
    }, []);

    const value = {
        axios,
        authUser,
        onlineUsers,
        socket,
        isLoading,
        login,
        logout,
        updateProfile,
        refreshToken,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
