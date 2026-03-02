// ===============================
// BACK4APP CONFIGURATION
// ===============================

// Make sure this script is loaded AFTER parse.min.js
// <script src="https://npmcdn.com/parse/dist/parse.min.js"></script>

// Initialize Parse with your new keys
Parse.initialize(
    "46LC4r7Yd2qnuNWYBU5KVmws940Qh0AjE15wzoJt", // Application ID
    "GmwiSEc2ptMPGx7zusu3N9UaA8Nvn2oxKbVVIRKA",  // JavaScript Key
    "WxkZjSeBNKbHWyouy4fSew0hLoFnxyDztZtlvxrM"   // Master Key
);
Parse.serverURL = "https://parseapi.back4app.com";

// ===============================
// BACKEND LOGIC
// ===============================

const Backend = {
    // ========== USER AUTH ==========
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
            const user = await Parse.User.logIn(username, password);
            
            // Check role
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

    // ========== ADVERTISEMENT FUNCTIONS ==========
    
    // Create a new advertisement (uses master key for security)
    async createAd(adData) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

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
            
            // Use master key for write operations
            await ad.save(null, { useMasterKey: true });
            
            return { success: true, ad };
            
        } catch (error) {
            console.error("Create ad error:", error);
            return { success: false, message: error.message };
        }
    },

    // Get all active advertisements
    async getActiveAds(options = {}) {
        try {
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            
            query.equalTo("active", true);
            query.descending("createdAt");
            
            // Filter by category if specified
            if (options.category && options.category !== 'all') {
                query.equalTo("category", options.category);
            }
            
            // Filter by shop if specified
            if (options.shopId) {
                query.equalTo("shopId", options.shopId);
            }
            
            // Search by food name
            if (options.search) {
                query.matches("foodName", new RegExp(options.search, "i"));
            }
            
            // Limit results
            query.limit(options.limit || 100);
            
            const ads = await query.find({ useMasterKey: true });
            
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
            
        } catch (error) {
            console.error("Get ads error:", error);
            return [];
        }
    },

    // Get advertisements for a specific shop
    async getShopAds(shopId) {
        try {
            if (!shopId) {
                const currentUser = Parse.User.current();
                shopId = currentUser?.id;
            }
            
            if (!shopId) return [];
            
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            
            query.equalTo("shopId", shopId);
            query.descending("createdAt");
            
            const ads = await query.find({ useMasterKey: true });
            
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

            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            
            const ad = await query.get(adId, { useMasterKey: true });
            
            // Check if this ad belongs to the current user
            if (ad.get("shopId") !== currentUser.id) {
                return { success: false, message: "Unauthorized" };
            }
            
            // Update fields
            Object.keys(updates).forEach(key => {
                if (key === 'expiryDate') {
                    ad.set(key, new Date(updates[key]));
                } else if (key === 'discount' || key === 'originalPrice') {
                    ad.set(key, parseFloat(updates[key]));
                } else {
                    ad.set(key, updates[key]);
                }
            });
            
            await ad.save(null, { useMasterKey: true });
            
            return { success: true };
            
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

            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            
            const ad = await query.get(adId, { useMasterKey: true });
            
            // Check if this ad belongs to the current user
            if (ad.get("shopId") !== currentUser.id) {
                return { success: false, message: "Unauthorized" };
            }
            
            await ad.destroy({ useMasterKey: true });
            
            return { success: true };
            
        } catch (error) {
            console.error("Delete ad error:", error);
            return { success: false, message: error.message };
        }
    },

    // Increment view count (when someone views the ad)
    async incrementViews(adId) {
        try {
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            
            const ad = await query.get(adId, { useMasterKey: true });
            ad.increment("views");
            await ad.save(null, { useMasterKey: true });
            
            return { success: true };
            
        } catch (error) {
            console.error("Increment views error:", error);
            return { success: false };
        }
    },

    // Mark as claimed (when someone uses the discount)
    async incrementClaimed(adId) {
        try {
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            
            const ad = await query.get(adId, { useMasterKey: true });
            ad.increment("claimed");
            await ad.save(null, { useMasterKey: true });
            
            return { success: true };
            
        } catch (error) {
            console.error("Increment claimed error:", error);
            return { success: false };
        }
    },

    // Search advertisements by location (for future GPS feature)
    async searchNearby(latitude, longitude, radius = 10) {
        try {
            // This requires GeoPoints in Back4App
            // For now, return all active ads
            return await this.getActiveAds();
            
        } catch (error) {
            console.error("Search nearby error:", error);
            return [];
        }
    },

    // ========== FRIDGE/INVENTORY FUNCTIONS ==========
    
    // Save fridge items to cloud
    async saveFridgeItems(items) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            const Fridge = Parse.Object.extend("Fridge");
            
            // Delete existing items for this user
            const query = new Parse.Query(Fridge);
            query.equalTo("userId", currentUser.id);
            const oldItems = await query.find({ useMasterKey: true });
            await Parse.Object.destroyAll(oldItems, { useMasterKey: true });
            
            // Save new items
            const newItems = items.map(item => {
                const fridgeItem = new Fridge();
                fridgeItem.set("userId", currentUser.id);
                fridgeItem.set("name", item.name);
                fridgeItem.set("expiryDate", new Date(item.expiry));
                fridgeItem.set("category", item.category || "other");
                fridgeItem.set("addedDate", new Date());
                return fridgeItem;
            });
            
            await Parse.Object.saveAll(newItems, { useMasterKey: true });
            
            return { success: true };
            
        } catch (error) {
            console.error("Save fridge error:", error);
            return { success: false, message: error.message };
        }
    },

    // Load fridge items from cloud
    async loadFridgeItems() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];

            const Fridge = Parse.Object.extend("Fridge");
            const query = new Parse.Query(Fridge);
            
            query.equalTo("userId", currentUser.id);
            query.descending("createdAt");
            
            const items = await query.find({ useMasterKey: true });
            
            return items.map(item => ({
                name: item.get("name"),
                expiry: item.get("expiryDate").toISOString().split('T')[0],
                category: item.get("category")
            }));
            
        } catch (error) {
            console.error("Load fridge error:", error);
            return [];
        }
    },

    // ========== SHOPPING LIST FUNCTIONS ==========
    
    // Save shopping lists to cloud
    async saveShoppingLists(lists) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            const ShoppingLists = Parse.Object.extend("ShoppingLists");
            
            // Delete existing
            const query = new Parse.Query(ShoppingLists);
            query.equalTo("userId", currentUser.id);
            const oldLists = await query.find({ useMasterKey: true });
            await Parse.Object.destroyAll(oldLists, { useMasterKey: true });
            
            // Save new
            const newLists = new ShoppingLists();
            newLists.set("userId", currentUser.id);
            newLists.set("lists", JSON.stringify(lists));
            newLists.set("lastUpdated", new Date());
            
            await newLists.save(null, { useMasterKey: true });
            
            return { success: true };
            
        } catch (error) {
            console.error("Save lists error:", error);
            return { success: false, message: error.message };
        }
    },

    // Load shopping lists from cloud
    async loadShoppingLists() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return null;

            const ShoppingLists = Parse.Object.extend("ShoppingLists");
            const query = new Parse.Query(ShoppingLists);
            
            query.equalTo("userId", currentUser.id);
            query.descending("lastUpdated");
            
            const result = await query.first({ useMasterKey: true });
            
            if (result) {
                return JSON.parse(result.get("lists"));
            }
            
            return null;
            
        } catch (error) {
            console.error("Load lists error:", error);
            return null;
        }
    },

    // ========== SYNC FUNCTIONS ==========
    
    // Sync all local data to cloud
    async syncAll() {
        try {
            // Sync shopping lists
            const localLists = localStorage.getItem("shoplists");
            if (localLists) {
                await this.saveShoppingLists(JSON.parse(localLists));
            }
            
            // Sync fridge items
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

    // Load all cloud data to local
    async loadAll() {
        try {
            // Load shopping lists
            const cloudLists = await this.loadShoppingLists();
            if (cloudLists) {
                localStorage.setItem("shoplists", JSON.stringify(cloudLists));
            }
            
            // Load fridge items
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
    
    // Check if user is authenticated
    isAuthenticated() {
        return Parse.User.current() !== null;
    },

    // Get current user role
    getUserRole() {
        const user = Parse.User.current();
        return user ? user.get("role") : null;
    },

    // Test connection to Back4App
    async testConnection() {
        try {
            const TestObject = Parse.Object.extend("TestConnection");
            const testObject = new TestObject();
            testObject.set("test", "Hello at " + new Date().toISOString());
            await testObject.save({ useMasterKey: true });
            console.log("✅ Back4App connection successful!");
            return { success: true };
        } catch (error) {
            console.error("❌ Back4App connection failed:", error);
            return { success: false, error };
        }
    }
};
