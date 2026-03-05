// ===============================
// BACK4APP CONFIGURATION
// ===============================

// Initialize Parse (without master key in init)
Parse.initialize(
    "46LC4r7Yd2qnuNWYBU5KVmws940Qh0AjE15wzoJt", // Application ID
    "GmwiSEc2ptMPGx7zusu3N9UaA8Nvn2oxKbVVIRKA"   // JavaScript Key
);
Parse.serverURL = "https://parseapi.back4app.com";

// Master key for admin operations
const MASTER_KEY = "WxkZjSeBNKbHWyouy4fSew0hLoFnxyDztZtlvxrM";

// Helper function for master key operations
async function withMasterKey(fn) {
    Parse.CoreManager.set('MASTER_KEY', MASTER_KEY);
    try {
        const result = await fn();
        Parse.CoreManager.set('MASTER_KEY', null);
        return result;
    } catch (error) {
        Parse.CoreManager.set('MASTER_KEY', null);
        throw error;
    }
}

const Backend = {
    // ========== USER AUTH ==========
    async register(username, password, role, businessDetails = null) {
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
            user.set("email", businessDetails?.email || `${username}@foodsave.com`);
            
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
                user.set("businessRole", "owner"); // First user is OWNER
                user.set("businessStaff", []); // Array of staff user IDs
            }
            
            await user.signUp();
            
            // Store in localStorage
            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("businessName", businessDetails?.name || username);
                localStorage.setItem("businessRole", "owner");
                localStorage.setItem("businessVerified", "false");
                
                if (businessDetails) {
                    localStorage.setItem("businessDetails", JSON.stringify({
                        ...businessDetails,
                        verified: false,
                        role: "owner"
                    }));
                }
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
            
            if (user.get("role") !== role) {
                await Parse.User.logOut();
                return { success: false, message: "Wrong login type selected" };
            }

            // Store in localStorage
            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("businessName", user.get("businessName") || username);
                
                // Get business role from user object
                const userBusinessRole = user.get("businessRole") || 'owner';
                localStorage.setItem("businessRole", userBusinessRole);
                
                // Get verification status
                const isVerified = user.get("businessVerified") || false;
                localStorage.setItem("businessVerified", isVerified ? "true" : "false");
                
                // Store business details
                const businessDetails = {
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
                    verified: isVerified,
                    role: userBusinessRole
                };
                localStorage.setItem("businessDetails", JSON.stringify(businessDetails));
                
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

    // ========== BUSINESS PROFILE FUNCTIONS ==========
    
    async getBusinessProfile() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            return await withMasterKey(async () => {
                return {
                    id: currentUser.id,
                    username: currentUser.get("username"),
                    businessName: currentUser.get("businessName"),
                    businessPhone: currentUser.get("businessPhone"),
                    businessEmail: currentUser.get("businessEmail"),
                    businessAddress: currentUser.get("businessAddress"),
                    businessLat: currentUser.get("businessLat"),
                    businessLng: currentUser.get("businessLng"),
                    businessOpen: currentUser.get("businessOpen"),
                    businessClose: currentUser.get("businessClose"),
                    businessType: currentUser.get("businessType"),
                    businessTaxId: currentUser.get("businessTaxId"),
                    businessVerified: currentUser.get("businessVerified"),
                    businessRole: currentUser.get("businessRole"),
                    businessStaff: currentUser.get("businessStaff") || [],
                    createdAt: currentUser.get("createdAt")
                };
            });
        } catch (error) {
            console.error("Get business profile error:", error);
            return { success: false, message: error.message };
        }
    },

    async updateBusinessProfile(updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            // Check permissions (only owner and managers can edit)
            const userRole = currentUser.get("businessRole");
            if (userRole !== "owner" && userRole !== "manager") {
                return { success: false, message: "Only owners and managers can edit business profile" };
            }

            return await withMasterKey(async () => {
                Object.keys(updates).forEach(key => {
                    if (key.startsWith('business')) {
                        currentUser.set(key, updates[key]);
                    }
                });
                
                await currentUser.save();
                
                // Update localStorage
                const businessDetails = JSON.parse(localStorage.getItem("businessDetails") || "{}");
                Object.assign(businessDetails, updates);
                localStorage.setItem("businessDetails", JSON.stringify(businessDetails));
                
                return { success: true };
            });
        } catch (error) {
            console.error("Update business profile error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== STAFF MANAGEMENT ==========
    
    async addStaffMember(staffUsername, staffRole = "staff") {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            // Only owners can add staff
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can add staff members" };
            }

            return await withMasterKey(async () => {
                // Find staff user
                const query = new Parse.Query(Parse.User);
                query.equalTo("username", staffUsername);
                const staffUser = await query.first();
                
                if (!staffUser) {
                    return { success: false, message: "User not found" };
                }

                // Check if user is already an advertiser
                if (staffUser.get("role") !== "advertiser") {
                    return { success: false, message: "User must be an advertiser" };
                }

                // Get current staff list
                const staffList = currentUser.get("businessStaff") || [];
                
                // Check if already added
                if (staffList.includes(staffUser.id)) {
                    return { success: false, message: "Staff member already added" };
                }

                // Add to staff list
                staffList.push(staffUser.id);
                currentUser.set("businessStaff", staffList);
                await currentUser.save();

                // Set staff member's business role
                staffUser.set("businessRole", staffRole);
                staffUser.set("businessName", currentUser.get("businessName"));
                staffUser.set("businessId", currentUser.id);
                await staffUser.save();

                return { success: true, message: "Staff member added" };
            });
        } catch (error) {
            console.error("Add staff error:", error);
            return { success: false, message: error.message };
        }
    },

    async removeStaffMember(staffId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            // Only owners can remove staff
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can remove staff members" };
            }

            return await withMasterKey(async () => {
                const staffList = currentUser.get("businessStaff") || [];
                const updatedList = staffList.filter(id => id !== staffId);
                currentUser.set("businessStaff", updatedList);
                await currentUser.save();

                // Clear staff member's business role
                const staffUser = await new Parse.Query(Parse.User).get(staffId, { useMasterKey: true });
                staffUser.unset("businessRole");
                staffUser.unset("businessName");
                staffUser.unset("businessId");
                await staffUser.save();

                return { success: true };
            });
        } catch (error) {
            console.error("Remove staff error:", error);
            return { success: false, message: error.message };
        }
    },

    async getStaffList() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return [];
            }

            return await withMasterKey(async () => {
                const staffIds = currentUser.get("businessStaff") || [];
                if (staffIds.length === 0) return [];

                const query = new Parse.Query(Parse.User);
                query.containedIn("objectId", staffIds);
                const staffUsers = await query.find();

                return staffUsers.map(user => ({
                    id: user.id,
                    username: user.get("username"),
                    role: user.get("businessRole"),
                    email: user.get("email")
                }));
            });
        } catch (error) {
            console.error("Get staff list error:", error);
            return [];
        }
    },

    // ========== BUSINESS VERIFICATION ==========
    
    async submitVerification(documents) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            // Only owners can submit verification
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can submit verification" };
            }

            return await withMasterKey(async () => {
                // For demo purposes, automatically verify
                currentUser.set("businessVerified", true);
                await currentUser.save();
                
                // Update localStorage
                localStorage.setItem("businessVerified", "true");
                const businessDetails = JSON.parse(localStorage.getItem("businessDetails") || "{}");
                businessDetails.verified = true;
                localStorage.setItem("businessDetails", JSON.stringify(businessDetails));
                
                return { success: true, message: "Business verified!" };
            });
        } catch (error) {
            console.error("Submit verification error:", error);
            return { success: false, message: error.message };
        }
    },

    async getVerificationStatus() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return null;
            }

            return {
                status: currentUser.get("businessVerified") ? "verified" : "pending",
                verified: currentUser.get("businessVerified") || false
            };
        } catch (error) {
            console.error("Get verification status error:", error);
            return null;
        }
    },

    // ========== ADVERTISEMENT FUNCTIONS ==========
    
    async createAd(adData) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            // Check if business is verified for posting ads
            if (!currentUser.get("businessVerified")) {
                return { success: false, message: "Business must be verified to post ads" };
            }

            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const ad = new Ad();
                
                ad.set("foodName", adData.foodName);
                ad.set("discount", parseFloat(adData.discount));
                ad.set("expiryDate", new Date(adData.expiryDate));
                ad.set("businessName", currentUser.get("businessName"));
                ad.set("businessId", currentUser.id);
                ad.set("description", adData.description || "");
                ad.set("originalPrice", parseFloat(adData.originalPrice) || 0);
                ad.set("category", adData.category || "other");
                ad.set("active", true);
                ad.set("views", 0);
                ad.set("claimed", 0);
                ad.set("postedBy", currentUser.id);
                ad.set("postedByRole", currentUser.get("businessRole"));
                
                await ad.save();
                return { success: true, ad };
            });
            
        } catch (error) {
            console.error("Create ad error:", error);
            return { success: false, message: error.message };
        }
    },

    async getActiveAds(options = {}) {
        try {
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                query.equalTo("active", true);
                query.descending("createdAt");
                
                if (options.category && options.category !== 'all') {
                    query.equalTo("category", options.category);
                }
                
                if (options.businessId) {
                    query.equalTo("businessId", options.businessId);
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
                    businessName: ad.get("businessName"),
                    shopName: ad.get("businessName"),
                    description: ad.get("description"),
                    originalPrice: ad.get("originalPrice"),
                    category: ad.get("category"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    postedBy: ad.get("postedBy"),
                    postedByRole: ad.get("postedByRole"),
                    createdAt: ad.get("createdAt")
                }));
            });
            
        } catch (error) {
            console.error("Get ads error:", error);
            return [];
        }
    },

    async getBusinessAds(businessId) {
        try {
            return await withMasterKey(async () => {
                if (!businessId) {
                    const currentUser = Parse.User.current();
                    businessId = currentUser?.id;
                }
                
                if (!businessId) return [];
                
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                query.equalTo("businessId", businessId);
                query.descending("createdAt");
                
                const ads = await query.find();
                
                return ads.map(ad => ({
                    id: ad.id,
                    foodName: ad.get("foodName"),
                    discount: ad.get("discount"),
                    expiryDate: ad.get("expiryDate"),
                    businessName: ad.get("businessName"),
                    active: ad.get("active"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    postedBy: ad.get("postedBy"),
                    postedByRole: ad.get("postedByRole"),
                    createdAt: ad.get("createdAt")
                }));
            });
            
        } catch (error) {
            console.error("Get business ads error:", error);
            return [];
        }
    },

    async getShopAds(businessId) {
        return this.getBusinessAds(businessId);
    },

    async updateAd(adId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                const ad = await query.get(adId);
                
                if (ad.get("businessId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                
                Object.keys(updates).forEach(key => {
                    if (key === 'expiryDate') {
                        ad.set(key, new Date(updates[key]));
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

    async deleteAd(adId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }

            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                const ad = await query.get(adId);
                
                if (ad.get("businessId") !== currentUser.id) {
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

    async incrementViews(adId) {
        try {
            return await withMasterKey(async () => {
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

    async incrementClaimed(adId) {
        try {
            return await withMasterKey(async () => {
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

            return await withMasterKey(async () => {
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

            return await withMasterKey(async () => {
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

            return await withMasterKey(async () => {
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

            return await withMasterKey(async () => {
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

    getBusinessRole() {
        const user = Parse.User.current();
        return user ? user.get("businessRole") : null;
    },

    isVerified() {
        const user = Parse.User.current();
        return user ? user.get("businessVerified") : false;
    },

    async testConnection() {
        try {
            return await withMasterKey(async () => {
                const TestObject = Parse.Object.extend("TestConnection");
                const testObj = new TestObject();
                testObj.set("test", "Hello at " + new Date().toISOString());
                await testObj.save();
                console.log("✅ foodsave cloud connected");
                return { success: true };
            });
        } catch (error) {
            console.error("❌ foodsave cloud error:", error);
            return { success: false, error };
        }
    }
};
