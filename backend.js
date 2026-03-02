// ===============================
// BACK4APP CONFIGURATION
// ===============================

// Make sure this script is loaded AFTER parse.min.js
// <script src="https://npmcdn.com/parse/dist/parse.min.js"></script>

// Initialize Parse with ALL required parameters
Parse.initialize(
    "qMx3AJogl2rGNkcT2bnnBYzS2zQoXKjZYGEUcAg", // Application ID
    "IsAcXogzafbrBpvseDfAB189zAxeUfbwUgXBMeI5",  // JavaScript Key
    "zalJri1j4YFdQLfJaDo6pgjJ2EF721GR6M896iNg"   // Master Key (optional but helps)
);

// IMPORTANT: Use the correct server URL for Back4App
Parse.serverURL = "https://parseapi.back4app.com";

// ===============================
// BACKEND LOGIC with better error handling
// ===============================

const Backend = {

    async register(username, password, role) {
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

            // Create new user
            const user = new Parse.User();
            user.set("username", username);
            user.set("password", password);
            user.set("role", role); // custom field

            // Additional security
            user.set("email", username + "@temp.com"); // Back4App often requires email
            
            console.log("Attempting to register user:", username, "with role:", role);

            // Sign up the user
            await user.signUp();
            
            console.log("Registration successful!");
            return { 
                success: true, 
                message: "Registration successful! Please login." 
            };
            
        } catch (error) {
            console.error("Registration error details:", error);
            
            // Better error messages
            let message = error.message;
            if (error.code === 202) {
                message = "Username already exists. Please choose another.";
            } else if (error.code === 203) {
                message = "Email already exists.";
            } else if (error.code === 100) {
                message = "Network error. Check your internet connection.";
            } else if (error.code === 125) {
                message = "Invalid email format.";
            }
            
            return { 
                success: false, 
                message: message || "Registration failed. Please try again." 
            };
        }
    },

    async login(username, password, role) {
        try {
            // Validate inputs
            if (!username || !password || !role) {
                return { 
                    success: false, 
                    message: "All fields are required" 
                };
            }

            console.log("Attempting login for:", username, "as", role);

            // Try to log in
            const user = await Parse.User.logIn(username, password);
            
            console.log("Login successful, checking role...");

            // Check if user has the correct role
            const userRole = user.get("role");
            
            if (userRole !== role) {
                // Log out if role doesn't match
                await Parse.User.logOut();
                console.log("Role mismatch. Expected:", role, "Got:", userRole);
                return { 
                    success: false, 
                    message: "Wrong login type selected. You are registered as: " + userRole 
                };
            }

            // Store in localStorage for easy access
            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.removeItem("loggedInConsumer");
            } else {
                localStorage.setItem("loggedInConsumer", username);
                localStorage.removeItem("loggedInShop");
            }

            console.log("Login successful for role:", role);
            return { 
                success: true,
                role: role,
                username: username
            };
            
        } catch (error) {
            console.error("Login error details:", error);
            
            // Better error messages
            let message = error.message;
            if (error.code === 101) {
                message = "Invalid username or password.";
            } else if (error.code === 100) {
                message = "Network error. Check your internet connection.";
            }
            
            return { 
                success: false, 
                message: message || "Login failed. Please try again." 
            };
        }
    },

    async logout() {
        try {
            await Parse.User.logOut();
            // Clear all localStorage items
            localStorage.removeItem("loggedInUser");
            localStorage.removeItem("userRole");
            localStorage.removeItem("loggedInShop");
            localStorage.removeItem("loggedInConsumer");
            console.log("Logout successful");
            return { success: true };
        } catch (error) {
            console.error("Logout error:", error);
            return { success: false, message: error.message };
        }
    },

    getCurrentUser() {
        return Parse.User.current();
    },

    async checkAuthStatus() {
        const user = Parse.User.current();
        if (user) {
            try {
                // Refresh the user data
                await user.fetch();
                return {
                    isAuthenticated: true,
                    username: user.get("username"),
                    role: user.get("role")
                };
            } catch (error) {
                console.error("Error fetching user:", error);
                return { isAuthenticated: false };
            }
        }
        return { isAuthenticated: false };
    },

    requireAuth(requiredRole) {
        const user = Parse.User.current();

        if (!user) {
            alert("Please login first.");
            location.href = "login.html";
            return false;
        }

        const role = user.get("role");

        if (requiredRole && role !== requiredRole) {
            alert("Access denied. You need " + requiredRole + " access.");
            location.href = "login.html";
            return false;
        }
        
        return true;
    }
};
