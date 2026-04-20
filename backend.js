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
            user.set("email", businessDetails?.email || `${username}@foodsave.com`);
            
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
                await currentUser.save();
                const staffUser = await new Parse.Query(Parse.User).get(staffId, { useMasterKey: true });
                staffUser.unset("businessRole");
                staffUser.unset("businessName");
                staffUser.unset("businessId");
                await staffUser.save();
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
                const staffUsers = await query.find();
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
                await currentUser.save();
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
                
                await ad.save();
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
                
                const ads = await query.find();
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
                    quantityLeft: ad.get("quantityLeft")
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
                
                const ads = await query.find();
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
                    quantityLeft: ad.get("quantityLeft")
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
                const ad = await new Parse.Query(Ad).get(adId);
                if (ad.get("businessId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                Object.keys(updates).forEach(key => {
                    if (key === 'offerEnds') {
                        ad.set(key, new Date(updates[key]));
                    } else if (key === 'batchExpiryDate') {
                        ad.set(key, new Date(updates[key]));
                    } else {
                        ad.set(key, updates[key]);
                    }
                });
                await ad.save();
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
                const ad = await new Parse.Query(Ad).get(adId);
                if (ad.get("businessId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                await ad.destroy();
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
                const ad = await new Parse.Query(Ad).get(adId);
                ad.increment("views");
                await ad.save();
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },

    // ========== ORDER SYSTEM - FIXED WITH FALLBACK ==========
    
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

            console.log("Creating order with", orderItems.length, "items");
            for (let i = 0; i < orderItems.length; i++) {
                console.log(`Item ${i + 1}:`, orderItems[i].foodName, "ID:", orderItems[i].id);
            }

            // Get fresh user with master key
            let freshUser = await withMasterKey(async () => {
                const userQuery = new Parse.Query(Parse.User);
                return await userQuery.get(currentUser.id, { useMasterKey: true });
            });
            
            const walletBalance = freshUser.get("walletBalance") || 0;
            if (walletBalance < totalAmount) {
                return { success: false, message: `Insufficient balance. Need $${totalAmount.toFixed(2)}` };
            }

            const verifiedItems = [];
            
            for (const item of orderItems) {
                try {
                    console.log(`Verifying item: ${item.foodName} (ID: ${item.id})`);
                    const Ad = Parse.Object.extend("Advertisement");
                    const query = new Parse.Query(Ad);
                    let ad;
                    try {
                        ad = await query.get(item.id, { useMasterKey: true });
                    } catch (err) {
                        console.log(`Could not find by ID, trying by foodName: ${item.foodName}`);
                        // Fallback: search by foodName and businessName
                        const fallbackQuery = new Parse.Query(Ad);
                        fallbackQuery.equalTo("foodName", item.foodName);
                        fallbackQuery.equalTo("businessName", item.shopName);
                        fallbackQuery.equalTo("active", true);
                        fallbackQuery.greaterThan("quantityLeft", 0);
                        ad = await fallbackQuery.first({ useMasterKey: true });
                        if (ad) {
                            console.log(`Found fallback ad with ID: ${ad.id}`);
                        }
                    }
                    
                    if (!ad) {
                        return { success: false, message: `${item.foodName} is no longer available. Please remove it from cart.` };
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
                        ad, 
                        item,
                        discountedPrice,
                        businessId: ad.get("businessId"),
                        businessName: ad.get("businessName"),
                        originalPrice,
                        discount,
                        itemTotal
                    });
                } catch (err) {
                    console.error("Error verifying item:", item.id, err);
                    return { success: false, message: `${item.foodName} is no longer available. Please remove it from cart.` };
                }
            }

            if (verifiedItems.length === 0) {
                return { success: false, message: "No valid items in cart" };
            }

            return await withMasterKey(async () => {
                const newBalance = walletBalance - totalAmount;
                freshUser.set("walletBalance", newBalance);
                await freshUser.save(null, { useMasterKey: true });
                if (Parse.User.current()) {
                    Parse.User.current().set("walletBalance", newBalance);
                }
                localStorage.setItem("walletBalance", newBalance);

                const createdOrders = [];
                for (const verified of verifiedItems) {
                    const { ad, item, discountedPrice, businessId, businessName, originalPrice, discount, itemTotal } = verified;
                    
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
                    order.set("discount", discount);
                    order.set("originalPrice", originalPrice);
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
                    
                    await this.sendNotification(businessId, 
                        `🛒 New order! ${freshUser.get("username")} ordered ${item.quantity}x ${ad.get("foodName")} - $${itemTotal.toFixed(2)}`);
                }
                
                localStorage.removeItem('claimCart');
                console.log(`Successfully created ${createdOrders.length} orders`);
                return { 
                    success: true, 
                    message: `Order placed successfully! ${createdOrders.length} item(s) purchased.`,
                    orders: createdOrders,
                    newBalance: newBalance,
                    totalPaid: totalAmount
                };
            });
        } catch (error) {
            console.error("Create order error:", error);
            return { success: false, message: error.message || "Checkout failed. Please try again." };
        }
    },
    
    async sendNotification(businessId, message) {
        try {
            return await withMasterKey(async () => {
                const Notification = Parse.Object.extend("Notification");
                const notification = new Notification();
                notification.set("businessId", businessId);
                notification.set("message", message);
                notification.set("read", false);
                notification.set("createdAt", new Date());
                await notification.save();
                return { success: true };
            });
        } catch (error) {
            return { success: false };
        }
    },
    
    async getNotifications(businessId) {
        try {
            return await withMasterKey(async () => {
                const Notification = Parse.Object.extend("Notification");
                const query = new Parse.Query(Notification);
                query.equalTo("businessId", businessId);
                query.descending("createdAt");
                const notifications = await query.find();
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
    
    async markNotificationRead(notificationId) {
        try {
            return await withMasterKey(async () => {
                const Notification = Parse.Object.extend("Notification");
                const notification = await new Parse.Query(Notification).get(notificationId);
                notification.set("read", true);
                await notification.save();
                return { success: true };
            });
        } catch (error) {
            return { success: false };
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
                const orders = await query.find();
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
    
    async getConsumerOrders(consumerId) {
        try {
            return await withMasterKey(async () => {
                const Order = Parse.Object.extend("Order");
                const query = new Parse.Query(Order);
                query.equalTo("consumerId", consumerId);
                query.descending("createdAt");
                const orders = await query.find();
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
    
    async confirmOrderByBusiness(orderId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            
            return await withMasterKey(async () => {
                const Order = Parse.Object.extend("Order");
                const query = new Parse.Query(Order);
                const order = await query.get(orderId);
                
                if (!order) {
                    return { success: false, message: "Order not found" };
                }
                
                if (order.get("businessId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                
                if (order.get("status") !== "pending") {
                    return { success: false, message: "Order already processed" };
                }
                
                order.set("status", "confirmed_by_business");
                await order.save();
                
                await this.sendNotificationToConsumer(order.get("consumerId"),
                    `✅ Your order "${order.get("foodName")}" is ready for pickup!`);
                
                return { success: true, message: "Order confirmed! Customer notified." };
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    },
    
    async confirmCollectedByCustomer(orderId) {
        try {
            console.log("confirmCollectedByCustomer called with orderId:", orderId);
            
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            
            if (currentUser.get("role") !== "consumer") {
                return { success: false, message: "Only consumers can confirm pickup" };
            }
            
            return await withMasterKey(async () => {
                const Order = Parse.Object.extend("Order");
                const orderQuery = new Parse.Query(Order);
                const order = await orderQuery.get(orderId);
                
                if (!order) {
                    console.error("Order not found:", orderId);
                    return { success: false, message: "Order not found" };
                }
                
                if (order.get("consumerId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized - This is not your order" };
                }
                
                if (order.get("status") !== "confirmed_by_business") {
                    return { success: false, message: "Order must be confirmed by business first" };
                }
                
                const businessUserQuery = new Parse.Query(Parse.User);
                const businessUser = await businessUserQuery.get(order.get("businessId"), { useMasterKey: true });
                
                if (!businessUser) {
                    return { success: false, message: "Business not found" };
                }
                
                const pendingBalance = businessUser.get("pendingWalletBalance") || 0;
                const currentBalance = businessUser.get("businessWalletBalance") || 0;
                const orderAmount = order.get("totalAmount") || 0;
                
                order.set("status", "collected_by_customer");
                await order.save(null, { useMasterKey: true });
                
                businessUser.set("pendingWalletBalance", pendingBalance - orderAmount);
                businessUser.set("businessWalletBalance", currentBalance + orderAmount);
                await businessUser.save(null, { useMasterKey: true });
                
                await this.sendNotification(order.get("businessId"),
                    `💰 Payment released! Customer collected ${order.get("foodName")}. $${orderAmount.toFixed(2)} added to wallet.`);
                
                return { success: true, message: "Pickup confirmed! Payment released to business." };
            });
        } catch (error) {
            console.error("Confirm collected error:", error);
            return { success: false, message: error.message || "Failed to confirm pickup" };
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
                await notification.save();
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
                const notifications = await query.find();
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
                const notification = await new Parse.Query(ConsumerNotification).get(notificationId);
                notification.set("read", true);
                await notification.save();
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
                if (amount < 5) {
                    return { success: false, message: "Minimum withdrawal amount is $5" };
                }
                if (availableBalance < amount) {
                    return { success: false, message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` };
                }
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
                    walletBalance: user.get("walletBalance") || 0,
                    savedAddresses: user.get("savedAddresses") || [],
                    createdAt: user.get("createdAt")
                };
            });
        } catch (error) {
            return null;
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
    
    async updateConsumerProfile(userId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.id !== userId) {
                return { success: false, message: "Unauthorized" };
            }
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

    // ========== REVENUE & STATS ==========
    
    async getBusinessRevenue(businessId) {
        try {
            return await withMasterKey(async () => {
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
                const oldItems = await query.find();
                await Parse.Object.destroyAll(oldItems);
                const newItems = items.map(item => {
                    const fridgeItem = new Fridge();
                    fridgeItem.set("userId", currentUser.id);
                    fridgeItem.set("name", item.name);
                    fridgeItem.set("expiryDate", new Date(item.expiry));
                    fridgeItem.set("category", item.category || "other");
                    return fridgeItem;
                });
                await Parse.Object.saveAll(newItems);
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
                const items = await query.find();
                return items.map(item => ({
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
                const result = await query.first();
                return result ? JSON.parse(result.get("lists")) : null;
            });
        } catch (error) {
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
