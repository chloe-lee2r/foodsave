// ===============================
// BACK4APP CONFIGURATION
// ===============================

// Make sure this script is loaded AFTER parse.min.js
// <script src="https://npmcdn.com/parse/dist/parse.min.js"></script>

// IMPORTANT: For development only - enabling master key in browser
// In production, never expose master key in client code!

// Initialize Parse with your keys
Parse.initialize(
    "46LC4r7Yd2qnuNWYBU5KVmws940Qh0AjE15wzoJt", // Application ID
    "GmwiSEc2ptMPGx7zusu3N9UaA8Nvn2oxKbVVIRKA"   // JavaScript Key (no master key here)
);

// Set server URL
Parse.serverURL = "https://parseapi.back4app.com";

// Store master key separately for use in requests
const MASTER_KEY = "WxkZjSeBNKbHWyouy4fSew0hLoFnxyDztZtlvxrM";

// Helper function to make requests with master key
async function parseRequestWithMasterKey(fn) {
    try {
        // Set master key headers for this request
        Parse.CoreManager.set('MASTER_KEY', MASTER_KEY);
        const result = await fn();
        Parse.CoreManager.set('MASTER_KEY', null); // Clear after
        return result;
    } catch (error) {
        Parse.CoreManager.set('MASTER_KEY', null); // Clear on error
        throw error;
    }
}

// ===============================
// BACKEND LOGIC - Fixed for browser
// ===============================

const Backend = {
    // ========== USER AUTH (without master key - users need regular auth) ==========
    async register(username, password, role) {
        try {
            if (!username || !password || !role) {
                return { success: false, message: "All fields are required" };
            }

            if (password.length < 6) {
                return { success: false, message: "Password must be at least 6 characters" };
            }

            const user = new Parse.User();
            user.set("username", username);
            user.set("password", password);
            user.set("role", role);
            user.set("email", `${username}@foodsave.com`);
            
            // Regular signup - no master key needed
            await user.signUp();
            
            // Store in localStorage
            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("shopName", username);
            } else {
                localStorage.setItem("loggedInConsumer", username);
            }
            
            return { success: true, message: "Registration successful!" };
            
        } catch (error) {
            console.error("Registration error:", error);
            let message = error.message;
            if (error.code === 202) message = "Username already exists";
            if (error.code === 203) message = "Email already exists";
            return { success: false, message };
        }
    },

    async login(username, password, role) {
        try {
            // Regular login - no master key needed
            const user = await Parse.User.logIn(username, password);
            
            // Check role (user object already has this)
            if (user.get("role") !== role) {
                await Parse.User.logOut();
                return { success: false, message: "Wrong login type selected" };
            }

            // Store in localStorage
            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("shopName", username);
            } else {
                localStorage.setItem("loggedInConsumer", username);
            }
            
            return { success: true, role };
            
        } catch (error) {
            console.error("Login error:", error);
            let message = error.message;
            if (error.code === 101) message = "Invalid username or password";
            return { success: false, message };
        }
    },

    async logout() {
        try {
            await Parse.User.logOut();
            localStorage.clear();
            return { success: true };
        } catch (error) {
            console.error("Logout error:", error);
            return { success: false, message: error.message };
        }
    },

    getCurrentUser() {
        return Parse.User.current();
    },

    // ========== ADVERTISEMENT FUNCTIONS (using master key) ==========
    
    // Create a new advertisement
    async createAd(adData) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            // Use master key for this operation
            return await parseRequestWithMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const ad = new Ad();
                
                ad.set("foodName", adData.foodName);
                ad.set("discount", parseFloat(adData.discount));
                ad.set("expiryDate", new Date(adData.expiryDate));
                ad.set("shopName", adData.shopName);
                ad.set("shopId", currentUser.id);
                ad.set("description", adData.description || "");
                ad.set("originalPrice", parseFloat(adData.originalPrice) || 0);
                ad.set("category", adData.category || "other");
                ad.set("active", true);
                ad.set("views", 0);
                ad.set("claimed", 0);
                
                await ad.save();
                return { success: true, ad };
            });
            
        } catch (error) {
            console.error("Create ad error:", error);
            return { success: false, message: error.message };
        }
    },

    // Get all active advertisements
    async getActiveAds(options = {}) {
        try {
            return await parseRequestWithMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                query.equalTo("active", true);
                query.descending("createdAt");
                
                if (options.category && options.category !== 'all') {
                    query.equalTo("category", options.category);
                }
                
                if (options.shopId) {
                    query.equalTo("shopId", options.shopId);
                }
                
                if (options.search) {
                    query.matches("foodName", new RegExp(options.search, "i"));
                }
                
                query.limit(options.limit || 100);
                
                const ads = await query.find();
                
                return ads.map(ad => ({
                    id: ad.id,
                    foodName: ad.get("foodName"),
                    discount: ad.get("discount"),
                    expiryDate: ad.get("expiryDate"),
                    shopName: ad.get("shopName"),
                    description: ad.get("description"),
                    originalPrice: ad.get("originalPrice"),
                    category: ad.get("category"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    createdAt: ad.get("createdAt")
                }));
            });
            
        } catch (error) {
            console.error("Get ads error:", error);
            return [];
        }
    },

    // Get advertisements for a specific shop
    async getShopAds(shopId) {
        try {
            return await parseRequestWithMasterKey(async () => {
                if (!shopId) {
                    const currentUser = Parse.User.current();
                    shopId = currentUser?.id;
                }
                
                if (!shopId) return [];
                
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                query.equalTo("shopId", shopId);
                query.descending("createdAt");
                
                const ads = await query.find();
                
                return ads.map(ad => ({
                    id: ad.id,
                    foodName: ad.get("foodName"),
                    discount: ad.get("discount"),
                    expiryDate: ad.get("expiryDate"),
                    shopName: ad.get("shopName"),
                    active: ad.get("active"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    createdAt: ad.get("createdAt")
                }));
            });
            
        } catch (error) {
            console.error("Get shop ads error:", error);
            return [];
        }
    },

    // Update advertisement
    async updateAd(adId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            return await parseRequestWithMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                const ad = await query.get(adId);
                
                if (ad.get("shopId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                
                Object.keys(updates).forEach(key => {
                    if (key === 'expiryDate') {
                        ad.set(key, new Date(updates[key]));
                    } else if (key === 'discount' || key === 'originalPrice') {
                        ad.set(key, parseFloat(updates[key]));
                    } else {
                        ad.set(key, updates[key]);
                    }
                });
                
                await ad.save();
                return { success: true };
            });
            
        } catch (error) {
            console.error("Update ad error:", error);
            return { success: false, message: error.message };
        }
    },

    // Delete advertisement
    async deleteAd(adId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            return await parseRequestWithMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                const ad = await query.get(adId);
                
                if (ad.get("shopId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                
                await ad.destroy();
                return { success: true };
            });
            
        } catch (error) {
            console.error("Delete ad error:", error);
            return { success: false, message: error.message };
        }
    },

    // Increment view count
    async incrementViews(adId) {
        try {
            return await parseRequestWithMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                const ad = await query.get(adId);
                ad.increment("views");
                await ad.save();
                return { success: true };
            });
            
        } catch (error) {
            console.error("Increment views error:", error);
            return { success: false };
        }
    },

    // Mark as claimed
    async incrementClaimed(adId) {
        try {
            return await parseRequestWithMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                const ad = await query.get(adId);
                ad.increment("claimed");
                await ad.save();
                return { success: true };
            });
            
        } catch (error) {
            console.error("Increment claimed error:", error);
            return { success: false };
        }
    },

    // ========== FRIDGE FUNCTIONS ==========
    
    async saveFridgeItems(items) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            return await parseRequestWithMasterKey(async () => {
                const Fridge = Parse.Object.extend("Fridge");
                
                const query = new Parse.Query(Fridge);
                query.equalTo("userId", currentUser.id);
                const oldItems = await query.find();
                await Parse.Object.destroyAll(oldItems);
                
                const newItems = items.map(item => {
                    const fridgeItem = new Fridge();
                    fridgeItem.set("userId", currentUser.id);
                    fridgeItem.set("name", item.name);
                    fridgeItem.set("expiryDate", new Date(item.expiry));
                    fridgeItem.set("category", item.category || "other");
                    fridgeItem.set("addedDate", new Date());
                    return fridgeItem;
                });
                
                await Parse.Object.saveAll(newItems);
                return { success: true };
            });
            
        } catch (error) {
            console.error("Save fridge error:", error);
            return { success: false, message: error.message };
        }
    },

    async loadFridgeItems() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];

            return await parseRequestWithMasterKey(async () => {
                const Fridge = Parse.Object.extend("Fridge");
                const query = new Parse.Query(Fridge);
                
                query.equalTo("userId", currentUser.id);
                query.descending("createdAt");
                
                const items = await query.find();
                
                return items.map(item => ({
                    name: item.get("name"),
                    expiry: item.get("expiryDate").toISOString().split('T')[0],
                    category: item.get("category")
                }));
            });
            
        } catch (error) {
            console.error("Load fridge error:", error);
            return [];
        }
    },

    // ========== SHOPPING LIST FUNCTIONS ==========
    
    async saveShoppingLists(lists) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            return await parseRequestWithMasterKey(async () => {
                const ShoppingLists = Parse.Object.extend("ShoppingLists");
                
                const query = new Parse.Query(ShoppingLists);
                query.equalTo("userId", currentUser.id);
                const oldLists = await query.find();
                await Parse.Object.destroyAll(oldLists);
                
                const newLists = new ShoppingLists();
                newLists.set("userId", currentUser.id);
                newLists.set("lists", JSON.stringify(lists));
                newLists.set("lastUpdated", new Date());
                
                await newLists.save();
                return { success: true };
            });
            
        } catch (error) {
            console.error("Save lists error:", error);
            return { success: false, message: error.message };
        }
    },

    async loadShoppingLists() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return null;

            return await parseRequestWithMasterKey(async () => {
                const ShoppingLists = Parse.Object.extend("ShoppingLists");
                const query = new Parse.Query(ShoppingLists);
                
                query.equalTo("userId", currentUser.id);
                query.descending("lastUpdated");
                
                const result = await query.first();
                
                if (result) {
                    return JSON.parse(result.get("lists"));
                }
                return null;
            });
            
        } catch (error) {
            console.error("Load lists error:", error);
            return null;
        }
    },

    // ========== SYNC FUNCTIONS ==========
    
    async syncAll() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            
            const localLists = localStorage.getItem("shoplists");
            if (localLists) {
                await this.saveShoppingLists(JSON.parse(localLists));
            }
            
            const localFridge = localStorage.getItem("foodItems");
            if (localFridge) {
                await this.saveFridgeItems(JSON.parse(localFridge));
            }
            
            return { success: true };
            
        } catch (error) {
            console.error("Sync error:", error);
            return { success: false, message: error.message };
        }
    },

    async loadAll() {
        try {
            const cloudLists = await this.loadShoppingLists();
            if (cloudLists) {
                localStorage.setItem("shoplists", JSON.stringify(cloudLists));
            }
            
            const cloudFridge = await this.loadFridgeItems();
            if (cloudFridge.length > 0) {
                localStorage.setItem("foodItems", JSON.stringify(cloudFridge));
            }
            
            return { success: true };
            
        } catch (error) {
            console.error("Load error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== UTILITY ==========
    
    isAuthenticated() {
        return Parse.User.current() !== null;
    },

    getUserRole() {
        const user = Parse.User.current();
        return user ? user.get("role") : null;
    },

    async testConnection() {
        try {
            return await parseRequestWithMasterKey(async () => {
                const TestObject = Parse.Object.extend("TestConnection");
                const testObject = new TestObject();
                testObject.set("test", "Hello at " + new Date().toISOString());
                testObject.set("masterKey", "used");
                
                await testObject.save();
                console.log("✅ foodsave cloud connected");
                return { success: true };
            });
        } catch (error) {
            console.error("❌ foodsave cloud error:", error);
            return { success: false, error };
        }
    }
};
