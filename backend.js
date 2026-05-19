// ===============================
// BACK4APP CONFIGURATION
// ===============================

Parse.initialize(
    "46LC4r7Yd2qnuNWYBU5KVmws940Qh0AjE15wzoJt",
    "GmwiSEc2ptMPGx7zusu3N9UaA8Nvn2oxKbVVIRKA"
);
Parse.serverURL = "https://parseapi.back4app.com";

const MASTER_KEY = "WxkZjSeBNKbHWyouy4fSew0hLoFnxyDztZtlvxrM";

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
                user.set("savedAddresses", []);
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

    // ========== VALIDATION FUNCTIONS ==========
    
    async checkUsernameExists(username) {
        try {
            return await withMasterKey(async () => {
                const query = new Parse.Query(Parse.User);
                query.equalTo("username", username);
                const user = await query.first({ useMasterKey: true });
                return { exists: !!user };
            });
        } catch (error) {
            return { exists: false };
        }
    },

    async checkBusinessNameExists(businessName) {
        try {
            return await withMasterKey(async () => {
                const query = new Parse.Query(Parse.User);
                query.equalTo("businessName", businessName);
                const user = await query.first({ useMasterKey: true });
                return { exists: !!user };
            });
        } catch (error) {
            return { exists: false };
        }
    },

    // ========== DELETE ACCOUNT ==========
    
    async deleteAccount(userId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.id !== userId) return { success: false, message: "Unauthorized" };
            
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
                
                // Delete all related data
                try {
                    // Delete orders
                    const Order = Parse.Object.extend("Order");
                    const orderQuery = new Parse.Query(Order);
                    orderQuery.equalTo("consumerId", userId);
                    const orders = await orderQuery.find({ useMasterKey: true });
                    if (orders.length > 0) await Parse.Object.destroyAll(orders, { useMasterKey: true });
                    
                    // Delete fridge items
                    const Fridge = Parse.Object.extend("Fridge");
                    const fridgeQuery = new Parse.Query(Fridge);
                    fridgeQuery.equalTo("userId", userId);
                    const fridgeItems = await fridgeQuery.find({ useMasterKey: true });
                    if (fridgeItems.length > 0) await Parse.Object.destroyAll(fridgeItems, { useMasterKey: true });
                    
                    // Delete shopping lists
                    const ShoppingLists = Parse.Object.extend("ShoppingLists");
                    const listQuery = new Parse.Query(ShoppingLists);
                    listQuery.equalTo("userId", userId);
                    const lists = await listQuery.find({ useMasterKey: true });
                    if (lists.length > 0) await Parse.Object.destroyAll(lists, { useMasterKey: true });
                    
                    // Delete community shares
                    const CommunitySharing = Parse.Object.extend("CommunitySharing");
                    const shareQuery = new Parse.Query(CommunitySharing);
                    shareQuery.equalTo("sharerId", userId);
                    const shares = await shareQuery.find({ useMasterKey: true });
                    if (shares.length > 0) await Parse.Object.destroyAll(shares, { useMasterKey: true });
                    
                    // Delete notifications
                    const Notification = Parse.Object.extend("Notification");
                    const notifQuery = new Parse.Query(Notification);
                    notifQuery.equalTo("userId", userId);
                    const notifications = await notifQuery.find({ useMasterKey: true });
                    if (notifications.length > 0) await Parse.Object.destroyAll(notifications, { useMasterKey: true });
                    
                    const CommunityNotification = Parse.Object.extend("CommunityNotification");
                    const commNotifQuery = new Parse.Query(CommunityNotification);
                    commNotifQuery.equalTo("userId", userId);
                    const commNotifications = await commNotifQuery.find({ useMasterKey: true });
                    if (commNotifications.length > 0) await Parse.Object.destroyAll(commNotifications, { useMasterKey: true });
                    
                    const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
                    const consNotifQuery = new Parse.Query(ConsumerNotification);
                    consNotifQuery.equalTo("consumerId", userId);
                    const consNotifications = await consNotifQuery.find({ useMasterKey: true });
                    if (consNotifications.length > 0) await Parse.Object.destroyAll(consNotifications, { useMasterKey: true });
                    
                } catch (cleanupError) {
                    console.error("Error cleaning up user data:", cleanupError);
                }
                
                // Finally delete the user
                await user.destroy({ useMasterKey: true });
                
                return { success: true, message: "Account deleted successfully" };
            });
        } catch (error) {
            console.error("Error deleting account:", error);
            return { success: false, message: error.message || "Failed to delete account" };
        }
    },

    // ========== BUSINESS PROFILE ==========
    
    async getBusinessProfile() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            return await withMasterKey(async () => ({
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
                businessWalletBalance: currentUser.get("businessWalletBalance") || 0,
                pendingWalletBalance: currentUser.get("pendingWalletBalance") || 0,
                createdAt: currentUser.get("createdAt")
            }));
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async updateBusinessProfile(updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
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
                return { success: true };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    // ========== STAFF MANAGEMENT ==========
    
    async addStaffMember(staffUsername, staffRole = "staff") {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can add staff members" };
            }
            return await withMasterKey(async () => {
                const query = new Parse.Query(Parse.User);
                query.equalTo("username", staffUsername);
                const staffUser = await query.first({ useMasterKey: true });
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
                await currentUser.save(null, { useMasterKey: true });
                staffUser.set("businessRole", staffRole);
                staffUser.set("businessName", currentUser.get("businessName"));
                staffUser.set("businessId", currentUser.id);
                await staffUser.save(null, { useMasterKey: true });
                return { success: true, message: "Staff member added" };
            });
        } catch (error) {
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
            return await withMasterKey(async () => {
                const staffList = currentUser.get("businessStaff") || [];
                currentUser.set("businessStaff", staffList.filter(id => id !== staffId));
                await currentUser.save(null, { useMasterKey: true });
                const staffUser = await new Parse.Query(Parse.User).get(staffId, { useMasterKey: true });
                staffUser.unset("businessRole");
                staffUser.unset("businessName");
                staffUser.unset("businessId");
                await staffUser.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async getStaffList() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];
            return await withMasterKey(async () => {
                const staffIds = currentUser.get("businessStaff") || [];
                if (staffIds.length === 0) return [];
                const query = new Parse.Query(Parse.User);
                query.containedIn("objectId", staffIds);
                const staffUsers = await query.find({ useMasterKey: true });
                return staffUsers.map(user => ({
                    id: user.id,
                    username: user.get("username"),
                    role: user.get("businessRole"),
                    email: user.get("email")
                }));
            });
        } catch (error) {
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
            return await withMasterKey(async () => {
                currentUser.set("businessVerified", true);
                await currentUser.save(null, { useMasterKey: true });
                localStorage.setItem("businessVerified", "true");
                return { success: true, message: "Business verified!" };
            });
        } catch (error) {
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
            return null;
        }
    },

    // ========== ADVERTISEMENTS ==========
    
    async createAd(adData) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (!currentUser.get("businessVerified")) {
                return { success: false, message: "Business must be verified to post ads" };
            }

            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const ad = new Ad();
                ad.set("foodName", adData.foodName);
                ad.set("discount", parseFloat(adData.discount));
                ad.set("offerEnds", new Date(adData.offerEnds));
                ad.set("batchExpiryDate", new Date(adData.batchExpiryDate));
                ad.set("businessName", currentUser.get("businessName"));
                ad.set("businessId", currentUser.id);
                ad.set("description", adData.description || "");
                ad.set("originalPrice", parseFloat(adData.originalPrice) || 0);
                ad.set("category", adData.category || "other");
                ad.set("active", true);
                ad.set("views", 0);
                ad.set("claimed", 0);
                ad.set("batchNumber", adData.batchNumber || "");
                ad.set("quantityLeft", parseInt(adData.quantityLeft) || 0);
                ad.set("initialQuantity", parseInt(adData.quantityLeft) || 0);
                
                if (adData.imageBase64) {
                    ad.set("productImage", adData.imageBase64);
                }
                
                await ad.save(null, { useMasterKey: true });
                return { success: true, ad: ad, adId: ad.id };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async getActiveAds(options = {}) {
        try {
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                query.equalTo("active", true);
                query.greaterThan("offerEnds", new Date());
                query.greaterThan("quantityLeft", 0);
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
                
                const ads = await query.find({ useMasterKey: true });
                return ads.map(ad => ({
                    id: ad.id,
                    foodName: ad.get("foodName"),
                    discount: ad.get("discount"),
                    offerEnds: ad.get("offerEnds"),
                    batchExpiryDate: ad.get("batchExpiryDate"),
                    businessName: ad.get("businessName"),
                    shopName: ad.get("businessName"),
                    description: ad.get("description"),
                    originalPrice: ad.get("originalPrice"),
                    category: ad.get("category"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    batchNumber: ad.get("batchNumber"),
                    quantityLeft: ad.get("quantityLeft"),
                    productImage: ad.get("productImage") || null
                }));
            });
        } catch (error) {
            return [];
        }
    },

    async getShopAds(businessId) {
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
                
                const ads = await query.find({ useMasterKey: true });
                return ads.map(ad => ({
                    id: ad.id,
                    foodName: ad.get("foodName"),
                    discount: ad.get("discount"),
                    offerEnds: ad.get("offerEnds"),
                    batchExpiryDate: ad.get("batchExpiryDate"),
                    businessName: ad.get("businessName"),
                    active: ad.get("active"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    batchNumber: ad.get("batchNumber"),
                    quantityLeft: ad.get("quantityLeft"),
                    productImage: ad.get("productImage") || null
                }));
            });
        } catch (error) {
            return [];
        }
    },

    async getBusinessAds(businessId) {
        return this.getShopAds(businessId);
    },

    async updateAd(adId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const ad = await new Parse.Query(Ad).get(adId, { useMasterKey: true });
                if (ad.get("businessId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                Object.keys(updates).forEach(key => {
                    if (key === 'offerEnds') {
                        ad.set(key, new Date(updates[key]));
                    } else if (key === 'batchExpiryDate') {
                        ad.set(key, new Date(updates[key]));
                    } else if (key === 'imageBase64') {
                        ad.set("productImage", updates[key]);
                    } else {
                        ad.set(key, updates[key]);
                    }
                });
                await ad.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async deleteAd(adId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const ad = await new Parse.Query(Ad).get(adId, { useMasterKey: true });
                if (ad.get("businessId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                await ad.destroy({ useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async incrementViews(adId) {
        try {
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const ad = await new Parse.Query(Ad).get(adId, { useMasterKey: true });
                ad.increment("views");
                await ad.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    // ========== ORDER SYSTEM ==========
    
    async createOrder(items, totalAmount) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.get("role") !== "consumer") {
                return { success: false, message: "Please login as consumer" };
            }

            let orderItems = [];
            if (Array.isArray(items)) {
                orderItems = items;
            } else if (items && typeof items === 'object') {
                orderItems = [items];
            }
            
            if (orderItems.length === 0) {
                return { success: false, message: "No items in cart" };
            }

            return await withMasterKey(async () => {
                const userQuery = new Parse.Query(Parse.User);
                const freshUser = await userQuery.get(currentUser.id, { useMasterKey: true });
                
                const walletBalance = freshUser.get("walletBalance") || 0;
                
                if (walletBalance < totalAmount) {
                    return { success: false, message: `Insufficient balance. Need $${totalAmount.toFixed(2)}` };
                }

                const verifiedItems = [];
                
                for (const item of orderItems) {
                    const Ad = Parse.Object.extend("Advertisement");
                    const query = new Parse.Query(Ad);
                    
                    let ad;
                    try {
                        ad = await query.get(item.id, { useMasterKey: true });
                    } catch (err) {
                        const fallbackQuery = new Parse.Query(Ad);
                        fallbackQuery.equalTo("foodName", item.foodName);
                        fallbackQuery.equalTo("businessName", item.shopName);
                        fallbackQuery.equalTo("active", true);
                        ad = await fallbackQuery.first({ useMasterKey: true });
                    }
                    
                    if (!ad) {
                        return { success: false, message: `${item.foodName} is no longer available` };
                    }
                    
                    if (!ad.get("active")) {
                        return { success: false, message: `${item.foodName} is no longer available` };
                    }
                    
                    const quantityLeft = ad.get("quantityLeft") || 0;
                    if (quantityLeft < item.quantity) {
                        return { success: false, message: `Only ${quantityLeft} of ${item.foodName} left` };
                    }
                    
                    const originalPrice = ad.get("originalPrice") || 0;
                    const discount = ad.get("discount") || 0;
                    const discountedPrice = originalPrice * (1 - discount / 100);
                    const itemTotal = discountedPrice * item.quantity;
                    
                    verifiedItems.push({
                        ad, item, discountedPrice,
                        businessId: ad.get("businessId"),
                        businessName: ad.get("businessName"),
                        originalPrice, discount, itemTotal
                    });
                }

                if (verifiedItems.length === 0) {
                    return { success: false, message: "No valid items in cart" };
                }

                const newBalance = walletBalance - totalAmount;
                freshUser.set("walletBalance", newBalance);
                await freshUser.save(null, { useMasterKey: true });
                
                if (Parse.User.current()) {
                    Parse.User.current().set("walletBalance", newBalance);
                }
                localStorage.setItem("walletBalance", newBalance);

                const createdOrders = [];
                
                for (const verified of verifiedItems) {
                    const { ad, item, businessId, businessName, itemTotal } = verified;
                    
                    const newQuantityLeft = ad.get("quantityLeft") - item.quantity;
                    ad.set("quantityLeft", newQuantityLeft);
                    ad.increment("claimed", item.quantity);
                    if (newQuantityLeft === 0) {
                        ad.set("active", false);
                    }
                    await ad.save(null, { useMasterKey: true });
                    
                    const Order = Parse.Object.extend("Order");
                    const order = new Order();
                    order.set("adId", ad.id);
                    order.set("businessId", businessId);
                    order.set("businessName", businessName);
                    order.set("consumerId", freshUser.id);
                    order.set("consumerName", freshUser.get("username"));
                    order.set("foodName", ad.get("foodName"));
                    order.set("quantity", item.quantity);
                    order.set("discount", verified.discount);
                    order.set("originalPrice", verified.originalPrice);
                    order.set("batchNumber", ad.get("batchNumber") || "");
                    order.set("totalAmount", itemTotal);
                    order.set("status", "pending");
                    order.set("createdAt", new Date());
                    await order.save(null, { useMasterKey: true });
                    createdOrders.push(order);
                    
                    const businessUser = await new Parse.Query(Parse.User).get(businessId, { useMasterKey: true });
                    const currentPending = businessUser.get("pendingWalletBalance") || 0;
                    businessUser.set("pendingWalletBalance", currentPending + itemTotal);
                    await businessUser.save(null, { useMasterKey: true });
                    
                    await Backend.sendNotification(businessId, 
                        `🛒 New order! ${freshUser.get("username")} ordered ${item.quantity}x ${ad.get("foodName")} - $${itemTotal.toFixed(2)}`,
                        'order'
                    );
                }
                
                localStorage.removeItem('claimCart');
                
                return { 
                    success: true, 
                    message: `Order placed successfully!`,
                    orders: createdOrders,
                    newBalance: newBalance,
                    totalPaid: totalAmount
                };
            });
            
        } catch (error) {
            console.error("Create order error:", error);
            return { success: false, message: error.message || "Checkout failed" };
        }
    },

    async getConsumerOrders(consumerId) {
        try {
            return await withMasterKey(async () => {
                const Order = Parse.Object.extend("Order");
                const query = new Parse.Query(Order);
                query.equalTo("consumerId", consumerId);
                query.descending("createdAt");
                const orders = await query.find({ useMasterKey: true });
                return orders.map(o => ({
                    id: o.id,
                    businessName: o.get("businessName"),
                    foodName: o.get("foodName"),
                    quantity: o.get("quantity"),
                    totalAmount: o.get("totalAmount"),
                    status: o.get("status"),
                    createdAt: o.get("createdAt")
                }));
            });
        } catch (error) {
            return [];
        }
    },

    async getOrdersForBusiness(businessId) {
        try {
            return await withMasterKey(async () => {
                if (!businessId) {
                    const currentUser = Parse.User.current();
                    businessId = currentUser?.id;
                }
                if (!businessId) return [];
                
                const Order = Parse.Object.extend("Order");
                const query = new Parse.Query(Order);
                query.equalTo("businessId", businessId);
                query.descending("createdAt");
                const orders = await query.find({ useMasterKey: true });
                return orders.map(o => ({
                    id: o.id,
                    consumerName: o.get("consumerName"),
                    consumerId: o.get("consumerId"),
                    foodName: o.get("foodName"),
                    quantity: o.get("quantity"),
                    discount: o.get("discount"),
                    batchNumber: o.get("batchNumber"),
                    totalAmount: o.get("totalAmount"),
                    status: o.get("status"),
                    createdAt: o.get("createdAt")
                }));
            });
        } catch (error) {
            return [];
        }
    },

    async confirmOrderByBusiness(orderId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            
            return await withMasterKey(async () => {
                const Order = Parse.Object.extend("Order");
                const query = new Parse.Query(Order);
                const order = await query.get(orderId, { useMasterKey: true });
                
                if (!order) return { success: false, message: "Order not found" };
                if (order.get("businessId") !== currentUser.id) return { success: false, message: "Unauthorized" };
                if (order.get("status") !== "pending") return { success: false, message: "Order already processed" };
                
                order.set("status", "confirmed_by_business");
                await order.save(null, { useMasterKey: true });
                
                await Backend.sendNotificationToConsumer(order.get("consumerId"),
                    `✅ Your order "${order.get("foodName")}" is ready for pickup!`);
                
                return { success: true, message: "Order confirmed!" };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async confirmCollectedByCustomer(orderId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("role") !== "consumer") return { success: false, message: "Only consumers can confirm pickup" };
            
            return await withMasterKey(async () => {
                const Order = Parse.Object.extend("Order");
                const orderQuery = new Parse.Query(Order);
                const order = await orderQuery.get(orderId, { useMasterKey: true });
                
                if (!order) return { success: false, message: "Order not found" };
                if (order.get("consumerId") !== currentUser.id) return { success: false, message: "Unauthorized" };
                if (order.get("status") !== "confirmed_by_business") return { success: false, message: "Order must be confirmed by business first" };
                
                const businessUserQuery = new Parse.Query(Parse.User);
                const businessUser = await businessUserQuery.get(order.get("businessId"), { useMasterKey: true });
                if (!businessUser) return { success: false, message: "Business not found" };
                
                const pendingBalance = businessUser.get("pendingWalletBalance") || 0;
                const currentBalance = businessUser.get("businessWalletBalance") || 0;
                const orderAmount = order.get("totalAmount") || 0;
                
                order.set("status", "collected_by_customer");
                await order.save(null, { useMasterKey: true });
                
                businessUser.set("pendingWalletBalance", pendingBalance - orderAmount);
                businessUser.set("businessWalletBalance", currentBalance + orderAmount);
                await businessUser.save(null, { useMasterKey: true });
                
                await Backend.sendNotification(order.get("businessId"),
                    `💰 Payment released! Customer collected ${order.get("foodName")}. $${orderAmount.toFixed(2)} added to wallet.`);
                
                return { success: true, message: "Pickup confirmed!" };
            });
        } catch (error) {
            return { success: false, message: error.message || "Failed to confirm pickup" };
        }
    },

    // ========== NOTIFICATION SYSTEM ==========

    async sendNotification(userId, message, type = 'general') {
        try {
            return await withMasterKey(async () => {
                const Notification = Parse.Object.extend("Notification");
                const notification = new Notification();
                notification.set("userId", userId);
                notification.set("message", message);
                notification.set("type", type);
                notification.set("read", false);
                notification.set("createdAt", new Date());
                await notification.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    async getNotifications(userId) {
        try {
            return await withMasterKey(async () => {
                if (!userId) {
                    const currentUser = Parse.User.current();
                    userId = currentUser?.id;
                }
                if (!userId) return [];
                
                const Notification = Parse.Object.extend("Notification");
                const query = new Parse.Query(Notification);
                query.equalTo("userId", userId);
                query.descending("createdAt");
                query.limit(50);
                
                const notifications = await query.find({ useMasterKey: true });
                return notifications.map(n => ({
                    id: n.id,
                    message: n.get("message"),
                    type: n.get("type"),
                    read: n.get("read"),
                    createdAt: n.get("createdAt")
                }));
            });
        } catch (error) {
            return [];
        }
    },

    async markNotificationRead(notificationId) {
        try {
            return await withMasterKey(async () => {
                const Notification = Parse.Object.extend("Notification");
                const notification = await new Parse.Query(Notification).get(notificationId, { useMasterKey: true });
                notification.set("read", true);
                await notification.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    async sendNotificationToConsumer(consumerId, message) {
        try {
            return await withMasterKey(async () => {
                const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
                const notification = new ConsumerNotification();
                notification.set("consumerId", consumerId);
                notification.set("message", message);
                notification.set("read", false);
                notification.set("createdAt", new Date());
                await notification.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    async getConsumerNotifications(consumerId) {
        try {
            return await withMasterKey(async () => {
                const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
                const query = new Parse.Query(ConsumerNotification);
                query.equalTo("consumerId", consumerId);
                query.descending("createdAt");
                const notifications = await query.find({ useMasterKey: true });
                return notifications.map(n => ({
                    id: n.id,
                    message: n.get("message"),
                    read: n.get("read"),
                    createdAt: n.get("createdAt")
                }));
            });
        } catch (error) {
            return [];
        }
    },

    async markConsumerNotificationRead(notificationId) {
        try {
            return await withMasterKey(async () => {
                const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
                const notification = await new Parse.Query(ConsumerNotification).get(notificationId, { useMasterKey: true });
                notification.set("read", true);
                await notification.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    // ========== WALLET METHODS ==========
    
    async getWalletBalance(userId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
                return user.get("walletBalance") || 0;
            });
        } catch (error) {
            return 0;
        }
    },
    
    async addToWallet(userId, amount) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
                const currentBalance = user.get("walletBalance") || 0;
                user.set("walletBalance", currentBalance + amount);
                await user.save(null, { useMasterKey: true });
                if (userId === Parse.User.current()?.id) {
                    Parse.User.current().set("walletBalance", currentBalance + amount);
                    localStorage.setItem("walletBalance", currentBalance + amount);
                }
                return { success: true, newBalance: currentBalance + amount };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },
    
    async getBusinessWalletBalance(businessId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(businessId, { useMasterKey: true });
                return {
                    available: user.get("businessWalletBalance") || 0,
                    pending: user.get("pendingWalletBalance") || 0,
                    total: (user.get("businessWalletBalance") || 0) + (user.get("pendingWalletBalance") || 0)
                };
            });
        } catch (error) {
            return { available: 0, pending: 0, total: 0 };
        }
    },
    
    async requestWithdrawal(businessId, amount) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(businessId, { useMasterKey: true });
                const availableBalance = user.get("businessWalletBalance") || 0;
                if (amount < 5) return { success: false, message: "Minimum withdrawal amount is $5" };
                if (availableBalance < amount) return { success: false, message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` };
                user.set("businessWalletBalance", availableBalance - amount);
                await user.save(null, { useMasterKey: true });
                return { success: true, message: `Withdrawal request submitted for $${amount.toFixed(2)}` };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    // ========== CONSUMER PROFILE ==========
    
    async getConsumerProfile(consumerId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(consumerId, { useMasterKey: true });
                return {
                    id: user.id,
                    username: user.get("username"),
                    email: user.get("email"),
                    fullName: user.get("fullName") || user.get("username"),
                    phone: user.get("phone") || "",
                    walletBalance: user.get("walletBalance") || 0,
                    savedAddresses: user.get("savedAddresses") || [],
                    createdAt: user.get("createdAt")
                };
            });
        } catch (error) {
            return null;
        }
    },
    
    async updateConsumerProfile(userId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.id !== userId) return { success: false, message: "Unauthorized" };
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
                if (updates.email) user.set("email", updates.email);
                if (updates.phone) user.set("phone", updates.phone);
                if (updates.fullName) user.set("fullName", updates.fullName);
                await user.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async uploadProfilePicture(userId, imageBase64) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.id !== userId) return { success: false, message: "Unauthorized" };
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
                user.set("profilePicture", imageBase64);
                await user.save(null, { useMasterKey: true });
                localStorage.setItem("profilePicture", imageBase64);
                return { success: true };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },
    
    async saveAddress(userId, address) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
                const addresses = user.get("savedAddresses") || [];
                addresses.push({ id: Date.now(), ...address });
                user.set("savedAddresses", addresses);
                await user.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },
    
    async getSavedAddresses(userId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
                return user.get("savedAddresses") || [];
            });
        } catch (error) {
            return [];
        }
    },

    // ========== REVENUE & STATS ==========
    
    async getBusinessRevenue(businessId) {
        try {
            return await withMasterKey(async () => {
                const Order = Parse.Object.extend("Order");
                const query = new Parse.Query(Order);
                query.equalTo("businessId", businessId);
                query.equalTo("status", "collected_by_customer");
                const orders = await query.find({ useMasterKey: true });
                let totalRevenue = 0;
                for (const order of orders) {
                    totalRevenue += order.get("totalAmount") || 0;
                }
                return { totalRevenue, totalOrders: orders.length };
            });
        } catch (error) {
            return null;
        }
    },

    async getNearExpiryStats(businessId) {
        try {
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                query.equalTo("businessId", businessId);
                query.greaterThan("offerEnds", new Date());
                const ads = await query.find({ useMasterKey: true });
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
            });
        } catch (error) {
            return null;
        }
    },

    // ========== FRIDGE FUNCTIONS ==========
    
    async saveFridgeItems(items) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            return await withMasterKey(async () => {
                const Fridge = Parse.Object.extend("Fridge");
                const query = new Parse.Query(Fridge);
                query.equalTo("userId", currentUser.id);
                const oldItems = await query.find({ useMasterKey: true });
                await Parse.Object.destroyAll(oldItems, { useMasterKey: true });
                const newItems = items.map(item => {
                    const fridgeItem = new Fridge();
                    fridgeItem.set("userId", currentUser.id);
                    fridgeItem.set("name", item.name);
                    fridgeItem.set("expiryDate", new Date(item.expiry));
                    fridgeItem.set("category", item.category || "other");
                    return fridgeItem;
                });
                await Parse.Object.saveAll(newItems, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
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
                const items = await query.find({ useMasterKey: true });
                return items.map(item => ({
                    id: item.id,
                    name: item.get("name"),
                    expiry: item.get("expiryDate").toISOString().split('T')[0],
                    category: item.get("category")
                }));
            });
        } catch (error) {
            return [];
        }
    },

    // ========== SHOPPING LIST ==========
    
    async saveShoppingLists(lists) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            return await withMasterKey(async () => {
                const ShoppingLists = Parse.Object.extend("ShoppingLists");
                const query = new Parse.Query(ShoppingLists);
                query.equalTo("userId", currentUser.id);
                const oldLists = await query.find({ useMasterKey: true });
                await Parse.Object.destroyAll(oldLists, { useMasterKey: true });
                const newLists = new ShoppingLists();
                newLists.set("userId", currentUser.id);
                newLists.set("lists", JSON.stringify(lists));
                newLists.set("lastUpdated", new Date());
                await newLists.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
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
                const result = await query.first({ useMasterKey: true });
                return result ? JSON.parse(result.get("lists")) : null;
            });
        } catch (error) {
            return null;
        }
    },

    // ========== COMMUNITY SHARING SYSTEM ==========

    async createCommunityShare(shareData) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };

            return await withMasterKey(async () => {
                const CommunitySharing = Parse.Object.extend("CommunitySharing");
                const share = new CommunitySharing();
                
                share.set("sharedBy", {
                    __type: "Pointer",
                    className: "_User",
                    objectId: currentUser.id
                });
                
                share.set("sharerName", currentUser.get("username"));
                share.set("sharerId", currentUser.id);
                share.set("foodItems", shareData.foodItems || []);
                share.set("description", shareData.description || "");
                share.set("reason", shareData.reason || "cooked_too_much");
                share.set("shareType", shareData.shareType || "giveaway");
                share.set("dietaryInfo", shareData.dietaryInfo || {});
                share.set("category", "community");
                share.set("active", true);
                share.set("status", "available");
                
                if (shareData.location) {
                    share.set("location", new Parse.GeoPoint({
                        latitude: shareData.location.lat,
                        longitude: shareData.location.lng
                    }));
                    share.set("locationAddress", shareData.location.address || "");
                }
                
                share.set("pickupInstructions", shareData.pickupInstructions || "");
                
                if (shareData.imageBase64) {
                    share.set("image", shareData.imageBase64);
                }
                
                share.set("claimedBy", []);
                share.set("views", 0);
                share.set("createdAt", new Date());
                share.set("expiresAt", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
                
                await share.save(null, { useMasterKey: true });
                return { success: true, shareId: share.id, message: "Food shared with community!" };
            });
        } catch (error) {
            console.error("Error creating community share:", error);
            return { success: false, message: error.message };
        }
    },

    async getCommunityShares(options = {}) {
        try {
            return await withMasterKey(async () => {
                const CommunitySharing = Parse.Object.extend("CommunitySharing");
                const query = new Parse.Query(CommunitySharing);
                
                query.equalTo("active", true);
                query.equalTo("status", "available");
                query.greaterThan("expiresAt", new Date());
                query.descending("createdAt");
                query.limit(options.limit || 100);
                
                if (options.userId) {
                    query.equalTo("sharerId", options.userId);
                }
                
                const shares = await query.find({ useMasterKey: true });
                
                return shares.map(share => {
                    const location = share.get("location");
                    
                    return {
                        id: share.id,
                        foodItems: share.get("foodItems") || [],
                        sharedBy: {
                            id: share.get("sharerId"),
                            username: share.get("sharerName") || "Anonymous"
                        },
                        location: location ? {
                            lat: location.latitude,
                            lng: location.longitude,
                            address: share.get("locationAddress") || "Location not specified"
                        } : null,
                        description: share.get("description") || "",
                        reason: share.get("reason") || "cooked_too_much",
                        shareType: share.get("shareType") || "giveaway",
                        dietaryInfo: share.get("dietaryInfo") || {},
                        pickupInstructions: share.get("pickupInstructions") || "",
                        image: share.get("image") || null,
                        views: share.get("views") || 0,
                        claimedBy: share.get("claimedBy") || [],
                        status: share.get("status"),
                        active: share.get("active"),
                        createdAt: share.get("createdAt"),
                        expiresAt: share.get("expiresAt")
                    };
                });
            });
        } catch (error) {
            console.error("Error getting community shares:", error);
            return [];
        }
    },

    async getMyShares(userId) {
        try {
            return await withMasterKey(async () => {
                if (!userId) {
                    const currentUser = Parse.User.current();
                    userId = currentUser?.id;
                }
                if (!userId) return [];
                
                const CommunitySharing = Parse.Object.extend("CommunitySharing");
                const query = new Parse.Query(CommunitySharing);
                query.equalTo("sharerId", userId);
                query.descending("createdAt");
                
                const shares = await query.find({ useMasterKey: true });
                return shares.map(share => {
                    const location = share.get("location");
                    return {
                        id: share.id,
                        foodItems: share.get("foodItems") || [],
                        location: location ? {
                            lat: location.latitude,
                            lng: location.longitude,
                            address: share.get("locationAddress") || ""
                        } : null,
                        description: share.get("description") || "",
                        reason: share.get("reason") || "",
                        shareType: share.get("shareType") || "giveaway",
                        dietaryInfo: share.get("dietaryInfo") || {},
                        pickupInstructions: share.get("pickupInstructions") || "",
                        image: share.get("image") || null,
                        views: share.get("views") || 0,
                        claimedBy: share.get("claimedBy") || [],
                        status: share.get("status"),
                        active: share.get("active"),
                        createdAt: share.get("createdAt"),
                        expiresAt: share.get("expiresAt")
                    };
                });
            });
        } catch (error) {
            return [];
        }
    },

    async claimCommunityShare(shareId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };

            return await withMasterKey(async () => {
                const CommunitySharing = Parse.Object.extend("CommunitySharing");
                const query = new Parse.Query(CommunitySharing);
                const share = await query.get(shareId, { useMasterKey: true });
                
                if (!share) return { success: false, message: "Share not found" };
                if (share.get("status") !== "available") return { success: false, message: "This food has already been claimed" };
                
                const claimedBy = share.get("claimedBy") || [];
                const alreadyClaimed = claimedBy.some(claim => claim.userId === currentUser.id);
                if (alreadyClaimed) return { success: false, message: "You've already claimed this" };
                
                claimedBy.push({
                    userId: currentUser.id,
                    username: currentUser.get("username"),
                    claimedAt: new Date().toISOString()
                });
                
                share.set("claimedBy", claimedBy);
                share.set("status", "claimed");
                share.set("claimedAt", new Date());
                await share.save(null, { useMasterKey: true });
                
                const sharerId = share.get("sharerId");
                if (sharerId) {
                    const foodNames = (share.get("foodItems") || []).map(item => 
                        typeof item === 'string' ? item : (item.name || 'food')
                    ).join(', ');
                    
                    const message = `🤝 ${currentUser.get("username")} wants to pick up your food: ${foodNames}`;
                    
                    await Backend.sendCommunityClaimNotification(
                        sharerId,
                        currentUser.get("username"),
                        share.get("foodItems") || [],
                        shareId
                    );
                    
                    await Backend.sendNotification(sharerId, message, 'community_claim');
                    await Backend.sendNotificationToConsumer(sharerId, message);
                }
                
                return { success: true, message: "Food claimed! Sharer notified." };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async sendCommunityClaimNotification(sharerId, claimerUsername, foodItems, shareId) {
        try {
            return await withMasterKey(async () => {
                const Notification = Parse.Object.extend("CommunityNotification");
                const notification = new Notification();
                
                const foodNames = (foodItems || []).map(item => 
                    typeof item === 'string' ? item : (item.name || 'food')
                ).join(', ');
                
                notification.set("userId", sharerId);
                notification.set("type", "claim");
                notification.set("title", "🤝 Someone wants your food!");
                notification.set("message", `${claimerUsername} wants to pick up: ${foodNames}`);
                notification.set("relatedShareId", shareId);
                notification.set("claimerUsername", claimerUsername);
                notification.set("read", false);
                notification.set("createdAt", new Date());
                
                await notification.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    async getCommunityNotifications(userId) {
        try {
            return await withMasterKey(async () => {
                if (!userId) {
                    const currentUser = Parse.User.current();
                    userId = currentUser?.id;
                }
                if (!userId) return [];
                
                const Notification = Parse.Object.extend("CommunityNotification");
                const query = new Parse.Query(Notification);
                query.equalTo("userId", userId);
                query.descending("createdAt");
                query.limit(50);
                
                const notifications = await query.find({ useMasterKey: true });
                return notifications.map(n => ({
                    id: n.id,
                    type: n.get("type"),
                    title: n.get("title") || "Community",
                    message: n.get("message"),
                    relatedShareId: n.get("relatedShareId"),
                    claimerUsername: n.get("claimerUsername"),
                    read: n.get("read"),
                    createdAt: n.get("createdAt"),
                    source: "community"
                }));
            });
        } catch (error) {
            return [];
        }
    },

    async markCommunityNotificationRead(notificationId) {
        try {
            return await withMasterKey(async () => {
                const Notification = Parse.Object.extend("CommunityNotification");
                const notification = await new Parse.Query(Notification).get(notificationId, { useMasterKey: true });
                notification.set("read", true);
                await notification.save(null, { useMasterKey: true });
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    async getUnreadCommunityNotificationCount(userId) {
        try {
            return await withMasterKey(async () => {
                if (!userId) {
                    const currentUser = Parse.User.current();
                    userId = currentUser?.id;
                }
                if (!userId) return 0;
                
                const Notification = Parse.Object.extend("CommunityNotification");
                const query = new Parse.Query(Notification);
                query.equalTo("userId", userId);
                query.equalTo("read", false);
                
                return await query.count({ useMasterKey: true });
            });
        } catch (error) {
            return 0;
        }
    },

    async deleteCommunityShare(shareId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            
            return await withMasterKey(async () => {
                const CommunitySharing = Parse.Object.extend("CommunitySharing");
                const query = new Parse.Query(CommunitySharing);
                const share = await query.get(shareId, { useMasterKey: true });
                
                if (share.get("sharerId") !== currentUser.id) {
                    return { success: false, message: "You can only delete your own shares" };
                }
                
                share.set("active", false);
                share.set("status", "deleted");
                await share.save(null, { useMasterKey: true });
                return { success: true, message: "Share removed" };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    // ========== ALL NOTIFICATIONS (COMBINED) ==========

    async getAllNotifications(userId) {
        try {
            return await withMasterKey(async () => {
                if (!userId) {
                    const currentUser = Parse.User.current();
                    userId = currentUser?.id;
                }
                if (!userId) return [];
                
                const generalNotifications = await Backend.getNotifications(userId);
                const communityNotifications = await Backend.getCommunityNotifications(userId);
                const consumerNotifications = await Backend.getConsumerNotifications(userId);
                
                const allNotifications = [
                    ...generalNotifications.map(n => ({ ...n, source: "general" })),
                    ...communityNotifications,
                    ...consumerNotifications.map(n => ({ ...n, source: "consumer", title: "Order Update" }))
                ];
                
                allNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                return allNotifications;
            });
        } catch (error) {
            return [];
        }
    },

    async markAllNotificationsRead(userId) {
        try {
            return await withMasterKey(async () => {
                if (!userId) {
                    const currentUser = Parse.User.current();
                    userId = currentUser?.id;
                }
                if (!userId) return { success: false };
                
                const Notification = Parse.Object.extend("Notification");
                const query1 = new Parse.Query(Notification);
                query1.equalTo("userId", userId);
                query1.equalTo("read", false);
                const generalNotifications = await query1.find({ useMasterKey: true });
                for (const n of generalNotifications) n.set("read", true);
                await Parse.Object.saveAll(generalNotifications, { useMasterKey: true });
                
                const CommunityNotification = Parse.Object.extend("CommunityNotification");
                const query2 = new Parse.Query(CommunityNotification);
                query2.equalTo("userId", userId);
                query2.equalTo("read", false);
                const communityNotifications = await query2.find({ useMasterKey: true });
                for (const n of communityNotifications) n.set("read", true);
                await Parse.Object.saveAll(communityNotifications, { useMasterKey: true });
                
                const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
                const query3 = new Parse.Query(ConsumerNotification);
                query3.equalTo("consumerId", userId);
                query3.equalTo("read", false);
                const consumerNotifications = await query3.find({ useMasterKey: true });
                for (const n of consumerNotifications) n.set("read", true);
                await Parse.Object.saveAll(consumerNotifications, { useMasterKey: true });
                
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    async getTotalUnreadCount(userId) {
        try {
            if (!userId) {
                const currentUser = Parse.User.current();
                userId = currentUser?.id;
            }
            if (!userId) return 0;
            
            const communityCount = await Backend.getUnreadCommunityNotificationCount(userId);
            
            let consumerCount = 0;
            try { const cn = await Backend.getConsumerNotifications(userId); consumerCount = cn.filter(n => !n.read).length; } catch (e) {}
            
            let generalCount = 0;
            try {
                const Notification = Parse.Object.extend("Notification");
                const query = new Parse.Query(Notification);
                query.equalTo("userId", userId);
                query.equalTo("read", false);
                generalCount = await query.count({ useMasterKey: true });
            } catch (e) {}
            
            return communityCount + consumerCount + generalCount;
        } catch (error) {
            return 0;
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
            return await withMasterKey(async () => {
                const TestObject = Parse.Object.extend("TestConnection");
                const testObj = new TestObject();
                testObj.set("test", "Hello from foodsavvi at " + new Date().toISOString());
                await testObj.save(null, { useMasterKey: true });
                console.log("✅ foodsavvi cloud connected");
                return { success: true };
            });
        } catch (error) {
            console.error("❌ foodsavvi cloud error:", error);
            return { success: false, error };
        }
    }
};
