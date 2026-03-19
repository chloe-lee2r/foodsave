// ===============================
// AUTHENTICATION MODULE
// ===============================

const Auth = {
    // Current user state
    currentUser: null,
    
    // ========== INITIALIZATION ==========
    async init() {
        // Check if user is already logged in via Parse
        const user = Parse.User.current();
        if (user) {
            this.currentUser = user;
            await this.syncLocalStorage();
            return true;
        }
        return false;
    },
    
    // ========== REGISTRATION ==========
    async register(username, password, role, businessDetails = null) {
        try {
            // Validate inputs
            if (!username || !password || !role) {
                return { 
                    success: false, 
                    message: "All fields are required" 
                };
            }

            if (password.length < 6) {
                return { 
                    success: false, 
                    message: "Password must be at least 6 characters" 
                };
            }

            const user = new Parse.User();
            user.set("username", username);
            user.set("password", password);
            user.set("role", role);
            user.set("email", `${username}@foodsave.com`);
            
            // Add business details if advertiser
            if (role === "advertiser" && businessDetails) {
                user.set("businessName", businessDetails.name);
                user.set("businessPhone", businessDetails.phone);
                user.set("businessEmail", businessDetails.email);
                user.set("businessAddress", businessDetails.address);
                user.set("businessLat", parseFloat(businessDetails.latitude) || 0);
                user.set("businessLng", parseFloat(businessDetails.longitude) || 0);
                user.set("businessOpen", businessDetails.openTime || "09:00");
                user.set("businessClose", businessDetails.closeTime || "21:00");
                user.set("businessType", businessDetails.type || "grocery");
                user.set("businessTaxId", businessDetails.taxId || "");
                user.set("businessVerified", false);
                user.set("businessRole", "owner");
                user.set("businessStaff", []);
            }
            
            await user.signUp();
            
            // Set current user
            this.currentUser = user;
            
            // Update localStorage
            this.updateLocalStorage(user, role, businessDetails);
            
            return { 
                success: true, 
                message: "Registration successful!",
                user: user,
                role: role
            };
            
        } catch (error) {
            console.error("Registration error:", error);
            let message = error.message;
            if (error.code === 202) message = "Username already exists";
            if (error.code === 203) message = "Email already exists";
            return { success: false, message };
        }
    },
    
    // ========== LOGIN ==========
    async login(username, password, role) {
        try {
            const user = await Parse.User.logIn(username, password);
            
            // Verify role
            if (user.get("role") !== role) {
                await Parse.User.logOut();
                this.currentUser = null;
                return { 
                    success: false, 
                    message: "Wrong login type selected" 
                };
            }

            // Set current user
            this.currentUser = user;
            
            // Update localStorage
            this.updateLocalStorage(user, role);
            
            return { 
                success: true, 
                role: role,
                user: user
            };
            
        } catch (error) {
            console.error("Login error:", error);
            let message = error.message;
            if (error.code === 101) message = "Invalid username or password";
            return { success: false, message };
        }
    },
    
    // ========== LOGOUT ==========
    async logout() {
        try {
            await Parse.User.logOut();
            this.currentUser = null;
            this.clearLocalStorage();
            return { success: true };
        } catch (error) {
            console.error("Logout error:", error);
            return { success: false, message: error.message };
        }
    },
    
    // ========== LOCAL STORAGE MANAGEMENT ==========
    updateLocalStorage(user, role, businessDetails = null) {
        const username = user.get("username");
        
        // Clear existing data
        this.clearLocalStorage();
        
        // Set common data
        localStorage.setItem("loggedInUser", username);
        localStorage.setItem("userRole", role);
        
        if (role === "advertiser") {
            localStorage.setItem("loggedInShop", username);
            localStorage.setItem("businessName", user.get("businessName") || username);
            localStorage.setItem("businessRole", user.get("businessRole") || "owner");
            localStorage.setItem("businessVerified", user.get("businessVerified") ? "true" : "false");
            
            if (businessDetails || user.get("businessName")) {
                const details = businessDetails || {
                    name: user.get("businessName") || username,
                    phone: user.get("businessPhone") || "",
                    email: user.get("businessEmail") || "",
                    address: user.get("businessAddress") || "",
                    latitude: user.get("businessLat") || "",
                    longitude: user.get("businessLng") || "",
                    openTime: user.get("businessOpen") || "09:00",
                    closeTime: user.get("businessClose") || "21:00",
                    type: user.get("businessType") || "grocery",
                    taxId: user.get("businessTaxId") || "",
                    verified: user.get("businessVerified") || false,
                    role: user.get("businessRole") || "owner"
                };
                localStorage.setItem("businessDetails", JSON.stringify(details));
            }
        } else {
            localStorage.setItem("loggedInConsumer", username);
        }
    },
    
    clearLocalStorage() {
        const keysToKeep = ['foodsave_ads', 'foodItems', 'shoplists']; // Keep app data
        const allKeys = Object.keys(localStorage);
        
        allKeys.forEach(key => {
            if (!keysToKeep.includes(key) && 
                !key.startsWith('foodsave_') && 
                key !== 'foodItems' && 
                key !== 'shoplists') {
                localStorage.removeItem(key);
            }
        });
    },
    
    async syncLocalStorage() {
        if (!this.currentUser) return;
        
        const user = this.currentUser;
        const role = user.get("role");
        
        localStorage.setItem("loggedInUser", user.get("username"));
        localStorage.setItem("userRole", role);
        
        if (role === "advertiser") {
            localStorage.setItem("loggedInShop", user.get("username"));
            localStorage.setItem("businessName", user.get("businessName") || user.get("username"));
            localStorage.setItem("businessRole", user.get("businessRole") || "owner");
            localStorage.setItem("businessVerified", user.get("businessVerified") ? "true" : "false");
            
            const details = {
                name: user.get("businessName") || user.get("username"),
                phone: user.get("businessPhone") || "",
                email: user.get("businessEmail") || "",
                address: user.get("businessAddress") || "",
                latitude: user.get("businessLat") || "",
                longitude: user.get("businessLng") || "",
                openTime: user.get("businessOpen") || "09:00",
                closeTime: user.get("businessClose") || "21:00",
                type: user.get("businessType") || "grocery",
                taxId: user.get("businessTaxId") || "",
                verified: user.get("businessVerified") || false,
                role: user.get("businessRole") || "owner"
            };
            localStorage.setItem("businessDetails", JSON.stringify(details));
        } else {
            localStorage.setItem("loggedInConsumer", user.get("username"));
        }
    },
    
    // ========== USER INFO GETTERS ==========
    getCurrentUser() {
        return this.currentUser || Parse.User.current();
    },
    
    getUserRole() {
        const user = this.getCurrentUser();
        return user ? user.get("role") : localStorage.getItem("userRole");
    },
    
    getBusinessRole() {
        const user = this.getCurrentUser();
        return user ? user.get("businessRole") : localStorage.getItem("businessRole");
    },
    
    isVerified() {
        const user = this.getCurrentUser();
        return user ? user.get("businessVerified") : localStorage.getItem("businessVerified") === 'true';
    },
    
    isAuthenticated() {
        return this.getCurrentUser() !== null;
    },
    
    getUsername() {
        const user = this.getCurrentUser();
        return user ? user.get("username") : localStorage.getItem("loggedInUser");
    },
    
    getBusinessName() {
        const user = this.getCurrentUser();
        if (user && user.get("role") === "advertiser") {
            return user.get("businessName") || user.get("username");
        }
        return localStorage.getItem("businessName");
    },
    
    // ========== SESSION MANAGEMENT ==========
    async checkSession() {
        try {
            const user = Parse.User.current();
            if (user) {
                // Verify session is still valid
                await user.fetch();
                this.currentUser = user;
                await this.syncLocalStorage();
                return true;
            }
            return false;
        } catch (error) {
            console.error("Session check failed:", error);
            return false;
        }
    },
    
    // ========== PROTECTED ROUTE GUARD ==========
    requireAuth(requiredRole = null) {
        const user = this.getCurrentUser();
        const role = this.getUserRole();
        
        if (!user) {
            window.location.href = "login.html";
            return false;
        }
        
        if (requiredRole && role !== requiredRole) {
            alert(`Access denied. This page requires ${requiredRole} access.`);
            window.location.href = "index.html";
            return false;
        }
        
        return true;
    },
    
    // ========== TEST CONNECTION ==========
    async testConnection() {
        try {
            const TestObject = Parse.Object.extend("TestConnection");
            const testObj = new TestObject();
            testObj.set("test", "Auth test at " + new Date().toISOString());
            await testObj.save({ useMasterKey: true });
            console.log("✅ Auth module connected");
            return { success: true };
        } catch (error) {
            console.error("❌ Auth module error:", error);
            return { success: false, error };
        }
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    await Auth.init();
    console.log("Auth module initialized");
});

// Make Auth globally available
window.Auth = Auth;
