
// ===============================
// BACK4APP CLIENT CONFIGURATION
// ===============================

Parse.initialize(
    "46LC4r7Yd2qnuNWYBU5KVmws940Qh0AjE15wzoJt",
    "GmwiSEc2ptMPGx7zusu3N9UaA8Nvn2oxKbVVIRKA"
);
Parse.serverURL = "https://parseapi.back4app.com";

// NO MASTER KEY IN CLIENT CODE - All sensitive operations go through Cloud Code

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

            const usernameCheck = await this.checkUsernameExists(username);
            if (usernameCheck.exists) {
                return { success: false, message: "Username already taken. Please choose another." };
            }

            if (role === "advertiser" && businessDetails && businessDetails.name) {
                const businessNameCheck = await this.checkBusinessNameExists(businessDetails.name);
                if (businessNameCheck.exists) {
                    return { success: false, message: "Business name already taken. Please choose another." };
                }
            }

            const user = new Parse.User();
            user.set("username", username);
            user.set("password", password);
            user.set("role", role);
            user.set("email", businessDetails?.email || `${username}@foodsavvi.com`);
            
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
                user.set("businessWalletBalance", 0);
                user.set("pendingWalletBalance", 0);
            } else if (role === "consumer") {
                user.set("walletBalance", 0);
            }
            
            await user.signUp();
            
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

            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("businessName", user.get("businessName") || username);
                localStorage.setItem("businessRole", user.get("businessRole") || 'owner');
                localStorage.setItem("businessVerified", user.get("businessVerified") ? "true" : "false");
                
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
                    verified: user.get("businessVerified") || false,
                    role: user.get("businessRole") || 'owner'
                };
                localStorage.setItem("businessDetails", JSON.stringify(businessDetails));
            } else {
                localStorage.setItem("loggedInConsumer", username);
                const walletBalance = user.get("walletBalance") || 0;
                localStorage.setItem("walletBalance", walletBalance);
                // Load profile picture
                const profilePic = user.get("profilePicture") || null;
                if (profilePic) {
                    localStorage.setItem("profilePicture", profilePic);
                }
            }
            
            return { success: true, role };
        } catch (error) {
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
            return { success: false, message: error.message };
        }
    },

    getCurrentUser() {
        return Parse.User.current();
    },

    // ========== CLOUD FUNCTION CALLS (No Master Key Needed) ==========
    
    async checkUsernameExists(username) {
        try {
            const result = await Parse.Cloud.run("checkUsernameExists", { username });
            return result;
        } catch (error) {
            console.error("checkUsernameExists error:", error);
            return { exists: false };
        }
    },

    async checkBusinessNameExists(businessName) {
        try {
            const result = await Parse.Cloud.run("checkBusinessNameExists", { businessName });
            return result;
        } catch (error) {
            console.error("checkBusinessNameExists error:", error);
            return { exists: false };
        }
    },

    async createOrder(items, totalAmount) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            const result = await Parse.Cloud.run("createOrder", {
                items: items,
                totalAmount: totalAmount,
                userId: currentUser.id
            });
            if (result.success) {
                localStorage.removeItem('claimCart');
            }
            return result;
        } catch (error) {
            console.error("createOrder error:", error);
            return { success: false, message: error.message };
        }
    },

    async addToWallet(userId, amount) {
        try {
            const result = await Parse.Cloud.run("addToWallet", { userId, amount });
            if (result.success && userId === Parse.User.current()?.id) {
                localStorage.setItem("walletBalance", result.newBalance);
                // Update current user object
                const currentUser = Parse.User.current();
                if (currentUser) {
                    currentUser.set("walletBalance", result.newBalance);
                }
            }
            return result;
        } catch (error) {
            console.error("addToWallet error:", error);
            return { success: false, message: error.message };
        }
    },

    async getWalletBalance(userId) {
        try {
            const result = await Parse.Cloud.run("getWalletBalance", { userId });
            return result.balance;
        } catch (error) {
            console.error("getWalletBalance error:", error);
            return 0;
        }
    },

    // ========== PROFILE PICTURE FUNCTIONS ==========

    async uploadProfilePicture(userId, imageBase64) {
        try {
            const result = await Parse.Cloud.run("uploadProfilePicture", { userId, imageBase64 });
            if (result.success) {
                localStorage.setItem("profilePicture", imageBase64);
                // Update current user object
                const currentUser = Parse.User.current();
                if (currentUser) {
                    currentUser.set("profilePicture", imageBase64);
                }
            }
            return result;
        } catch (error) {
            console.error("uploadProfilePicture error:", error);
            return { success: false, message: error.message };
        }
    },

    async getProfilePicture(userId) {
        try {
            const result = await Parse.Cloud.run("getProfilePicture", { userId });
            return result.profilePicture;
        } catch (error) {
            console.error("getProfilePicture error:", error);
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
            return await Parse.Cloud.run("createAd", {
                adData: adData,
                businessId: currentUser.id
            });
        } catch (error) {
            console.error("createAd error:", error);
            return { success: false, message: error.message };
        }
    },

    async getActiveAds(options = {}) {
        try {
            return await Parse.Cloud.run("getActiveAds", {
                category: options.category,
                search: options.search,
                limit: options.limit
            });
        } catch (error) {
            console.error("getActiveAds error:", error);
            return [];
        }
    },

    async getShopAds(businessId) {
        try {
            if (!businessId) {
                const currentUser = Parse.User.current();
                businessId = currentUser?.id;
            }
            if (!businessId) return [];
            return await Parse.Cloud.run("getShopAds", { businessId });
        } catch (error) {
            console.error("getShopAds error:", error);
            return [];
        }
    },

    async deleteAd(adId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            return await Parse.Cloud.run("deleteAd", {
                adId: adId,
                businessId: currentUser.id
            });
        } catch (error) {
            console.error("deleteAd error:", error);
            return { success: false, message: error.message };
        }
    },

    async updateAd(adId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            return await Parse.Cloud.run("updateAd", {
                adId: adId,
                businessId: currentUser.id,
                updates: updates
            });
        } catch (error) {
            console.error("updateAd error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== FRIDGE FUNCTIONS ==========

    async saveFridgeItems(items) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            return await Parse.Cloud.run("saveFridgeItems", {
                userId: currentUser.id,
                items: items
            });
        } catch (error) {
            console.error("saveFridgeItems error:", error);
            return { success: false };
        }
    },

    async loadFridgeItems() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];
            return await Parse.Cloud.run("loadFridgeItems", { userId: currentUser.id });
        } catch (error) {
            console.error("loadFridgeItems error:", error);
            return [];
        }
    },

    // ========== SHOPPING LIST FUNCTIONS ==========

    async saveShoppingLists(lists) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            return await Parse.Cloud.run("saveShoppingLists", {
                userId: currentUser.id,
                lists: lists
            });
        } catch (error) {
            console.error("saveShoppingLists error:", error);
            return { success: false };
        }
    },

    async loadShoppingLists() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return null;
            return await Parse.Cloud.run("loadShoppingLists", { userId: currentUser.id });
        } catch (error) {
            console.error("loadShoppingLists error:", error);
            return null;
        }
    },

    // ========== ORDER FUNCTIONS ==========

    async getConsumerOrders(consumerId) {
        try {
            return await Parse.Cloud.run("getConsumerOrders", { consumerId });
        } catch (error) {
            console.error("getConsumerOrders error:", error);
            return [];
        }
    },

    async confirmCollectedByCustomer(orderId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            return await Parse.Cloud.run("confirmCollectedByCustomer", {
                orderId: orderId,
                consumerId: currentUser.id
            });
        } catch (error) {
            console.error("confirmCollectedByCustomer error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== BUSINESS FUNCTIONS ==========

    async getBusinessProfile() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return null;
            return await Parse.Cloud.run("getBusinessProfile", { businessId: currentUser.id });
        } catch (error) {
            console.error("getBusinessProfile error:", error);
            return null;
        }
    },

    async getOrdersForBusiness(businessId) {
        try {
            if (!businessId) {
                const currentUser = Parse.User.current();
                businessId = currentUser?.id;
            }
            if (!businessId) return [];
            return await Parse.Cloud.run("getOrdersForBusiness", { businessId });
        } catch (error) {
            console.error("getOrdersForBusiness error:", error);
            return [];
        }
    },

    // ========== BUSINESS STAFF MANAGEMENT ==========
    
    async addStaffMember(staffUsername, staffRole = "staff") {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can add staff members" };
            }
            
            const query = new Parse.Query(Parse.User);
            query.equalTo("username", staffUsername);
            const staffUser = await query.first();
            if (!staffUser) return { success: false, message: "User not found" };
            if (staffUser.get("role") !== "advertiser") {
                return { success: false, message: "User must be an advertiser" };
            }
            const staffList = currentUser.get("businessStaff") || [];
            if (staffList.includes(staffUser.id)) {
                return { success: false, message: "Staff member already added" };
            }
            staffList.push(staffUser.id);
            currentUser.set("businessStaff", staffList);
            await currentUser.save();
            staffUser.set("businessRole", staffRole);
            staffUser.set("businessName", currentUser.get("businessName"));
            staffUser.set("businessId", currentUser.id);
            await staffUser.save();
            return { success: true, message: "Staff member added" };
        } catch (error) {
            console.error("addStaffMember error:", error);
            return { success: false, message: error.message };
        }
    },

    async removeStaffMember(staffId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can remove staff members" };
            }
            const staffList = currentUser.get("businessStaff") || [];
            currentUser.set("businessStaff", staffList.filter(id => id !== staffId));
            await currentUser.save();
            const staffUser = await new Parse.Query(Parse.User).get(staffId);
            staffUser.unset("businessRole");
            staffUser.unset("businessName");
            staffUser.unset("businessId");
            await staffUser.save();
            return { success: true };
        } catch (error) {
            console.error("removeStaffMember error:", error);
            return { success: false, message: error.message };
        }
    },

    async getStaffList() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];
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
        } catch (error) {
            console.error("getStaffList error:", error);
            return [];
        }
    },

    // ========== BUSINESS VERIFICATION ==========
    
    async submitVerification() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can submit verification" };
            }
            currentUser.set("businessVerified", true);
            await currentUser.save();
            localStorage.setItem("businessVerified", "true");
            return { success: true, message: "Business verified!" };
        } catch (error) {
            console.error("submitVerification error:", error);
            return { success: false, message: error.message };
        }
    },

    async getVerificationStatus() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return null;
            return {
                status: currentUser.get("businessVerified") ? "verified" : "pending",
                verified: currentUser.get("businessVerified") || false
            };
        } catch (error) {
            console.error("getVerificationStatus error:", error);
            return null;
        }
    },

    // ========== CONSUMER PROFILE ==========
    
    async getConsumerProfile(consumerId) {
        try {
            const user = await new Parse.Query(Parse.User).get(consumerId);
            return {
                id: user.id,
                username: user.get("username"),
                email: user.get("email"),
                walletBalance: user.get("walletBalance") || 0,
                createdAt: user.get("createdAt"),
                profilePicture: user.get("profilePicture") || null,
                phone: user.get("phone") || null,
                fullName: user.get("fullName") || user.get("username")
            };
        } catch (error) {
            console.error("getConsumerProfile error:", error);
            return null;
        }
    },
    
    async updateConsumerProfile(userId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.id !== userId) {
                return { success: false, message: "Unauthorized" };
            }
            const user = await new Parse.Query(Parse.User).get(userId);
            if (updates.email) user.set("email", updates.email);
            if (updates.phone) user.set("phone", updates.phone);
            if (updates.fullName) user.set("fullName", updates.fullName);
            await user.save();
            return { success: true };
        } catch (error) {
            console.error("updateConsumerProfile error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== BUSINESS WALLET ==========
    
    async getBusinessWalletBalance(businessId) {
        try {
            const user = await new Parse.Query(Parse.User).get(businessId);
            return {
                available: user.get("businessWalletBalance") || 0,
                pending: user.get("pendingWalletBalance") || 0,
                total: (user.get("businessWalletBalance") || 0) + (user.get("pendingWalletBalance") || 0)
            };
        } catch (error) {
            console.error("getBusinessWalletBalance error:", error);
            return { available: 0, pending: 0, total: 0 };
        }
    },
    
    async requestWithdrawal(businessId, amount) {
        try {
            const user = await new Parse.Query(Parse.User).get(businessId);
            const availableBalance = user.get("businessWalletBalance") || 0;
            if (amount < 5) {
                return { success: false, message: "Minimum withdrawal amount is $5" };
            }
            if (availableBalance < amount) {
                return { success: false, message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` };
            }
            user.set("businessWalletBalance", availableBalance - amount);
            await user.save();
            return { success: true, message: `Withdrawal request submitted for $${amount.toFixed(2)}` };
        } catch (error) {
            console.error("requestWithdrawal error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== REVENUE & STATS ==========
    
    async getBusinessRevenue(businessId) {
        try {
            const Order = Parse.Object.extend("Order");
            const query = new Parse.Query(Order);
            query.equalTo("businessId", businessId);
            query.equalTo("status", "collected_by_customer");
            const orders = await query.find();
            let totalRevenue = 0;
            for (const order of orders) {
                totalRevenue += order.get("totalAmount") || 0;
            }
            return { totalRevenue: totalRevenue, totalOrders: orders.length };
        } catch (error) {
            console.error("getBusinessRevenue error:", error);
            return null;
        }
    },

    async getNearExpiryStats(businessId) {
        try {
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            query.equalTo("businessId", businessId);
            query.greaterThan("offerEnds", new Date());
            const ads = await query.find();
            const expiringSoon = ads.filter(ad => {
                const daysLeft = Math.ceil((ad.get("offerEnds") - new Date()) / (1000 * 60 * 60 * 24));
                return daysLeft <= 3 && daysLeft > 0;
            });
            const lowStock = ads.filter(ad => ad.get("quantityLeft") <= 5 && ad.get("quantityLeft") > 0);
            const totalItems = ads.reduce((sum, ad) => sum + (ad.get("quantityLeft") || 0), 0);
            return {
                totalActiveOffers: ads.length,
                expiringSoonCount: expiringSoon.length,
                lowStockCount: lowStock.length,
                totalItemsLeft: totalItems
            };
        } catch (error) {
            console.error("getNearExpiryStats error:", error);
            return null;
        }
    },

    // ========== SYNC FUNCTIONS ==========
    
    async syncAll() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            const localLists = localStorage.getItem("shoplists");
            if (localLists) await this.saveShoppingLists(JSON.parse(localLists));
            const localFridge = localStorage.getItem("foodItems");
            if (localFridge) await this.saveFridgeItems(JSON.parse(localFridge));
            return { success: true };
        } catch (error) {
            console.error("syncAll error:", error);
            return { success: false };
        }
    },

    async loadAll() {
        try {
            const cloudLists = await this.loadShoppingLists();
            if (cloudLists) localStorage.setItem("shoplists", JSON.stringify(cloudLists));
            const cloudFridge = await this.loadFridgeItems();
            if (cloudFridge.length > 0) localStorage.setItem("foodItems", JSON.stringify(cloudFridge));
            return { success: true };
        } catch (error) {
            console.error("loadAll error:", error);
            return { success: false };
        }
    },

    // ========== UTILITY ==========
    
    isAuthenticated() { return Parse.User.current() !== null; },
    getUserRole() { const user = Parse.User.current(); return user ? user.get("role") : null; },
    getBusinessRole() { const user = Parse.User.current(); return user ? user.get("businessRole") : null; },
    isVerified() { const user = Parse.User.current(); return user ? user.get("businessVerified") : false; },

    async testConnection() {
        try {
            const TestObject = Parse.Object.extend("TestConnection");
            const testObj = new TestObject();
            testObj.set("test", "Hello from foodsavvi at " + new Date().toISOString());
            await testObj.save();
            console.log("✅ foodsavvi cloud connected");
            return { success: true };
        } catch (error) {
            console.error("❌ foodsavvi cloud error:", error);
            return { success: false, error };
        }
    }
};
