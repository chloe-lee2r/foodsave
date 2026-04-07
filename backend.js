// ===============================
// BACK4APP CONFIGURATION
// ===============================

// Initialize Parse
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
            } else if (role === "consumer") {
                user.set("walletBalance", 0);
                user.set("savedAddresses", []);
                user.set("savedPaymentMethods", []);
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

            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("businessName", user.get("businessName") || username);
                
                const userBusinessRole = user.get("businessRole") || 'owner';
                localStorage.setItem("businessRole", userBusinessRole);
                
                const isVerified = user.get("businessVerified") || false;
                localStorage.setItem("businessVerified", isVerified ? "true" : "false");
                
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
                const walletBalance = user.get("walletBalance") || 0;
                localStorage.setItem("walletBalance", walletBalance);
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
                    businessWalletBalance: currentUser.get("businessWalletBalance") || 0,
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

            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can add staff members" };
            }

            return await withMasterKey(async () => {
                const query = new Parse.Query(Parse.User);
                query.equalTo("username", staffUsername);
                const staffUser = await query.first();
                
                if (!staffUser) {
                    return { success: false, message: "User not found" };
                }

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

            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can remove staff members" };
            }

            return await withMasterKey(async () => {
                const staffList = currentUser.get("businessStaff") || [];
                const updatedList = staffList.filter(id => id !== staffId);
                currentUser.set("businessStaff", updatedList);
                await currentUser.save();

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

            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can submit verification" };
            }

            return await withMasterKey(async () => {
                currentUser.set("businessVerified", true);
                await currentUser.save();
                
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

            if (!currentUser.get("businessVerified")) {
                return { success: false, message: "Business must be verified to post ads" };
            }

            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const ad = new Ad();
                
                ad.set("foodName", adData.foodName);
                ad.set("discount", parseFloat(adData.discount));
                ad.set("offerEnds", new Date(adData.offerEnds));
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
                ad.set("batchNumber", adData.batchNumber || "");
                ad.set("quantityLeft", parseInt(adData.quantityLeft) || 0);
                ad.set("initialQuantity", parseInt(adData.quantityLeft) || 0);
                ad.set("pendingReservations", 0);
                
                await ad.save();
                
                setTimeout(() => this.cleanupExpiredOffers(), 1000);
                
                return { success: true, ad };
            });
            
        } catch (error) {
            console.error("Create ad error:", error);
            return { success: false, message: error.message };
        }
    },

    async getActiveAds(options = {}) {
        try {
            await this.cleanupExpiredOffers();
            
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                query.equalTo("active", true);
                query.descending("createdAt");
                query.greaterThan("offerEnds", new Date());
                query.greaterThan("quantityLeft", 0);
                
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
                    businessName: ad.get("businessName"),
                    shopName: ad.get("businessName"),
                    description: ad.get("description"),
                    originalPrice: ad.get("originalPrice"),
                    category: ad.get("category"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    postedBy: ad.get("postedBy"),
                    postedByRole: ad.get("postedByRole"),
                    createdAt: ad.get("createdAt"),
                    batchNumber: ad.get("batchNumber"),
                    quantityLeft: ad.get("quantityLeft"),
                    initialQuantity: ad.get("initialQuantity")
                }));
            });
            
        } catch (error) {
            console.error("Get ads error:", error);
            return [];
        }
    },

    async getShopAds(businessId) {
        try {
            await this.cleanupExpiredOffers();
            
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
                    businessName: ad.get("businessName"),
                    active: ad.get("active"),
                    views: ad.get("views"),
                    claimed: ad.get("claimed"),
                    postedBy: ad.get("postedBy"),
                    postedByRole: ad.get("postedByRole"),
                    createdAt: ad.get("createdAt"),
                    batchNumber: ad.get("batchNumber"),
                    quantityLeft: ad.get("quantityLeft"),
                    initialQuantity: ad.get("initialQuantity")
                }));
            });
            
        } catch (error) {
            console.error("Get business ads error:", error);
            return [];
        }
    },

    async getBusinessAds(businessId) {
        return this.getShopAds(businessId);
    },

    async cleanupExpiredOffers() {
        try {
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                query.lessThan("offerEnds", new Date());
                
                const expiredAds = await query.find();
                
                if (expiredAds.length > 0) {
                    console.log(`🗑️ Deleting ${expiredAds.length} expired offers`);
                    await Parse.Object.destroyAll(expiredAds);
                }
                
                const zeroQuantityQuery = new Parse.Query(Ad);
                zeroQuantityQuery.equalTo("quantityLeft", 0);
                zeroQuantityQuery.equalTo("active", true);
                const zeroQtyAds = await zeroQuantityQuery.find();
                
                for (const ad of zeroQtyAds) {
                    ad.set("active", false);
                    await ad.save();
                    console.log(`📦 Deactivated ad ${ad.id} - no stock left`);
                }
                
                return { success: true, deletedCount: expiredAds.length, deactivatedCount: zeroQtyAds.length };
            });
        } catch (error) {
            console.error("Cleanup expired offers error:", error);
            return { success: false, message: error.message };
        }
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
                    if (key === 'offerEnds') {
                        ad.set(key, new Date(updates[key]));
                    } else if (key === 'quantityLeft') {
                        ad.set(key, updates[key]);
                        if (updates[key] === 0) {
                            ad.set("active", false);
                        } else if (updates[key] > 0 && !ad.get("active")) {
                            ad.set("active", true);
                        }
                    } else {
                        ad.set(key, updates[key]);
                    }
                });
                
                await ad.save();
                
                setTimeout(() => this.cleanupExpiredOffers(), 1000);
                
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
                
                const currentQuantity = ad.get("quantityLeft") || 0;
                if (currentQuantity <= 0) {
                    return { success: false, message: "No stock left for this offer" };
                }
                
                ad.increment("claimed");
                ad.set("quantityLeft", currentQuantity - 1);
                
                if (currentQuantity - 1 === 0) {
                    ad.set("active", false);
                }
                
                await ad.save();
                return { success: true };
            });
            
        } catch (error) {
            console.error("Increment claimed error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== CLAIM & CART SYSTEM (FIXED WITH WALLET) ==========
    
    async processClaim(adId, quantity) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            
            if (currentUser.get("role") !== "consumer") {
                return { success: false, message: "Only consumers can claim deals" };
            }
            
            return await withMasterKey(async () => {
                const Ad = Parse.Object.extend("Advertisement");
                const query = new Parse.Query(Ad);
                
                const ad = await query.get(adId);
                
                if (!ad.get("active")) {
                    return { success: false, message: "This deal is no longer active" };
                }
                
                if (ad.get("offerEnds") < new Date()) {
                    ad.set("active", false);
                    await ad.save();
                    return { success: false, message: "This offer has expired" };
                }
                
                const currentQuantity = ad.get("quantityLeft") || 0;
                if (currentQuantity < quantity) {
                    return { success: false, message: `Only ${currentQuantity} items left` };
                }
                
                // Calculate total amount
                const discountedPrice = ad.get("originalPrice") * (1 - ad.get("discount") / 100);
                const totalAmount = discountedPrice * quantity;
                
                // Check consumer wallet balance
                const consumerWallet = currentUser.get("walletBalance") || 0;
                if (consumerWallet < totalAmount) {
                    return { success: false, message: `Insufficient wallet balance. Need $${totalAmount.toFixed(2)}` };
                }
                
                // Create claim record FIRST
                const Claim = Parse.Object.extend("Claim");
                const claim = new Claim();
                claim.set("adId", adId);
                claim.set("businessId", ad.get("businessId"));
                claim.set("businessName", ad.get("businessName"));
                claim.set("consumerId", currentUser.id);
                claim.set("consumerName", currentUser.get("username"));
                claim.set("foodName", ad.get("foodName"));
                claim.set("quantity", quantity);
                claim.set("discount", ad.get("discount"));
                claim.set("originalPrice", ad.get("originalPrice"));
                claim.set("batchNumber", ad.get("batchNumber"));
                claim.set("totalAmount", totalAmount);
                claim.set("status", "pending");
                claim.set("claimedAt", new Date());
                await claim.save();
                
                // Deduct from consumer wallet
                currentUser.set("walletBalance", consumerWallet - totalAmount);
                await currentUser.save();
                
                // Add to business wallet
                const businessUser = await new Parse.Query(Parse.User).get(ad.get("businessId"));
                const businessWallet = businessUser.get("businessWalletBalance") || 0;
                businessUser.set("businessWalletBalance", businessWallet + totalAmount);
                await businessUser.save();
                
                // Update ad stock
                ad.set("quantityLeft", currentQuantity - quantity);
                ad.increment("claimed", quantity);
                
                if (currentQuantity - quantity === 0) {
                    ad.set("active", false);
                }
                await ad.save();
                
                // Send notification to business
                await this.sendNotification(
                    ad.get("businessId"),
                    `🛒 New order! ${currentUser.get("username")} ordered ${quantity}x ${ad.get("foodName")} - $${totalAmount.toFixed(2)}`
                );
                
                // Update localStorage
                localStorage.setItem("walletBalance", consumerWallet - totalAmount);
                
                return { success: true, message: `Order placed! $${totalAmount.toFixed(2)} deducted from wallet.`, claimId: claim.id };
            });
            
        } catch (error) {
            console.error("Process claim error:", error);
            return { success: false, message: error.message };
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
            console.error("Send notification error:", error);
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
                query.limit(50);
                
                const notifications = await query.find();
                return notifications.map(n => ({
                    id: n.id,
                    message: n.get("message"),
                    read: n.get("read"),
                    createdAt: n.get("createdAt")
                }));
            });
        } catch (error) {
            console.error("Get notifications error:", error);
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
            console.error("Mark notification read error:", error);
            return { success: false };
        }
    },
    
    async getClaimsForBusiness(businessId) {
        try {
            return await withMasterKey(async () => {
                const Claim = Parse.Object.extend("Claim");
                const query = new Parse.Query(Claim);
                query.equalTo("businessId", businessId);
                query.descending("claimedAt");
                
                const claims = await query.find();
                return claims.map(c => ({
                    id: c.id,
                    adId: c.get("adId"),
                    consumerName: c.get("consumerName"),
                    consumerId: c.get("consumerId"),
                    foodName: c.get("foodName"),
                    quantity: c.get("quantity"),
                    discount: c.get("discount"),
                    originalPrice: c.get("originalPrice"),
                    batchNumber: c.get("batchNumber"),
                    totalAmount: c.get("totalAmount") || 0,
                    status: c.get("status"),
                    claimedAt: c.get("claimedAt")
                }));
            });
        } catch (error) {
            console.error("Get claims error:", error);
            return [];
        }
    },
    
    async updateClaimStatus(claimId, status) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            
            return await withMasterKey(async () => {
                const Claim = Parse.Object.extend("Claim");
                const claim = await new Parse.Query(Claim).get(claimId);
                
                if (claim.get("businessId") !== currentUser.id) {
                    return { success: false, message: "Unauthorized" };
                }
                
                claim.set("status", status);
                claim.set("updatedAt", new Date());
                await claim.save();
                
                return { success: true, message: `Order ${status}` };
            });
        } catch (error) {
            console.error("Update claim status error:", error);
            return { success: false, message: error.message };
        }
    },
    
    async getConsumerClaims(consumerId) {
        try {
            return await withMasterKey(async () => {
                const Claim = Parse.Object.extend("Claim");
                const query = new Parse.Query(Claim);
                query.equalTo("consumerId", consumerId);
                query.descending("claimedAt");
                
                const claims = await query.find();
                return claims.map(c => ({
                    id: c.id,
                    businessName: c.get("businessName"),
                    foodName: c.get("foodName"),
                    quantity: c.get("quantity"),
                    discount: c.get("discount"),
                    batchNumber: c.get("batchNumber"),
                    totalAmount: c.get("totalAmount") || 0,
                    status: c.get("status"),
                    claimedAt: c.get("claimedAt")
                }));
            });
        } catch (error) {
            console.error("Get consumer claims error:", error);
            return [];
        }
    },

    // ========== CONSUMER PROFILE ==========
    
    async getConsumerProfile(consumerId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(consumerId);
                return {
                    id: user.id,
                    username: user.get("username"),
                    email: user.get("email"),
                    role: user.get("role"),
                    walletBalance: user.get("walletBalance") || 0,
                    savedAddresses: user.get("savedAddresses") || [],
                    createdAt: user.get("createdAt")
                };
            });
        } catch (error) {
            console.error("Get consumer profile error:", error);
            return null;
        }
    },
    
    async getConsumerTransactionHistory(consumerId) {
        try {
            return await withMasterKey(async () => {
                const Claim = Parse.Object.extend("Claim");
                const query = new Parse.Query(Claim);
                query.equalTo("consumerId", consumerId);
                query.descending("claimedAt");
                
                const claims = await query.find();
                return claims.map(c => ({
                    id: c.id,
                    businessName: c.get("businessName"),
                    foodName: c.get("foodName"),
                    quantity: c.get("quantity"),
                    discount: c.get("discount"),
                    batchNumber: c.get("batchNumber"),
                    status: c.get("status"),
                    amount: c.get("totalAmount") || 0,
                    claimedAt: c.get("claimedAt")
                }));
            });
        } catch (error) {
            console.error("Get transaction history error:", error);
            return [];
        }
    },

    // ========== WALLET METHODS (CONSUMER) ==========
    
    async getWalletBalance(userId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId);
                return user.get("walletBalance") || 0;
            });
        } catch (error) {
            console.error("Get wallet balance error:", error);
            return 0;
        }
    },
    
    async addToWallet(userId, amount) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId);
                const currentBalance = user.get("walletBalance") || 0;
                user.set("walletBalance", currentBalance + amount);
                await user.save();
                
                if (userId === Parse.User.current()?.id) {
                    localStorage.setItem("walletBalance", currentBalance + amount);
                }
                
                return { success: true, newBalance: currentBalance + amount };
            });
        } catch (error) {
            console.error("Add to wallet error:", error);
            return { success: false, message: error.message };
        }
    },
    
    async deductFromWallet(userId, amount) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId);
                const currentBalance = user.get("walletBalance") || 0;
                if (currentBalance < amount) {
                    return { success: false, message: "Insufficient balance" };
                }
                user.set("walletBalance", currentBalance - amount);
                await user.save();
                
                if (userId === Parse.User.current()?.id) {
                    localStorage.setItem("walletBalance", currentBalance - amount);
                }
                
                return { success: true, newBalance: currentBalance - amount };
            });
        } catch (error) {
            console.error("Deduct from wallet error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== BUSINESS WALLET METHODS ==========
    
    async getBusinessWalletBalance(businessId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(businessId);
                return user.get("businessWalletBalance") || 0;
            });
        } catch (error) {
            console.error("Get business wallet error:", error);
            return 0;
        }
    },
    
    async addToBusinessWallet(businessId, amount) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(businessId);
                const currentBalance = user.get("businessWalletBalance") || 0;
                user.set("businessWalletBalance", currentBalance + amount);
                await user.save();
                return { success: true, newBalance: currentBalance + amount };
            });
        } catch (error) {
            console.error("Add to business wallet error:", error);
            return { success: false, message: error.message };
        }
    },
    
    async requestWithdrawal(businessId, amount) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(businessId);
                const currentBalance = user.get("businessWalletBalance") || 0;
                
                if (amount < 5) {
                    return { success: false, message: "Minimum withdrawal amount is $5" };
                }
                
                if (currentBalance < amount) {
                    return { success: false, message: `Insufficient balance. Available: $${currentBalance.toFixed(2)}` };
                }
                
                // Create withdrawal request record
                const Withdrawal = Parse.Object.extend("Withdrawal");
                const withdrawal = new Withdrawal();
                withdrawal.set("businessId", businessId);
                withdrawal.set("businessName", user.get("businessName"));
                withdrawal.set("amount", amount);
                withdrawal.set("status", "pending");
                withdrawal.set("requestedAt", new Date());
                await withdrawal.save();
                
                // Deduct from business wallet
                user.set("businessWalletBalance", currentBalance - amount);
                await user.save();
                
                return { success: true, message: `Withdrawal request submitted for $${amount.toFixed(2)}` };
            });
        } catch (error) {
            console.error("Request withdrawal error:", error);
            return { success: false, message: error.message };
        }
    },
    
    async getWithdrawalRequests(businessId) {
        try {
            return await withMasterKey(async () => {
                const Withdrawal = Parse.Object.extend("Withdrawal");
                const query = new Parse.Query(Withdrawal);
                query.equalTo("businessId", businessId);
                query.descending("requestedAt");
                
                const withdrawals = await query.find();
                return withdrawals.map(w => ({
                    id: w.id,
                    amount: w.get("amount"),
                    status: w.get("status"),
                    requestedAt: w.get("requestedAt"),
                    processedAt: w.get("processedAt")
                }));
            });
        } catch (error) {
            console.error("Get withdrawal requests error:", error);
            return [];
        }
    },

    // ========== PAYMENT & TRANSACTION METHODS ==========
    
    async saveTransaction(transaction) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) {
                return { success: false, message: "Please login first" };
            }
            
            return await withMasterKey(async () => {
                const Transaction = Parse.Object.extend("Transaction");
                const newTransaction = new Transaction();
                
                newTransaction.set("transactionId", transaction.id);
                newTransaction.set("userId", currentUser.id);
                newTransaction.set("userName", currentUser.get("username"));
                newTransaction.set("items", transaction.items);
                newTransaction.set("subtotal", transaction.subtotal);
                newTransaction.set("total", transaction.total);
                newTransaction.set("paymentMethod", transaction.paymentMethod);
                newTransaction.set("status", transaction.status);
                newTransaction.set("date", new Date(transaction.date));
                
                await newTransaction.save();
                
                return { success: true, transactionId: transaction.id };
            });
        } catch (error) {
            console.error("Save transaction error:", error);
            return { success: false, message: error.message };
        }
    },
    
    async getUserTransactions(userId) {
        try {
            return await withMasterKey(async () => {
                const Transaction = Parse.Object.extend("Transaction");
                const query = new Parse.Query(Transaction);
                query.equalTo("userId", userId);
                query.descending("date");
                
                const transactions = await query.find();
                return transactions.map(t => ({
                    id: t.id,
                    transactionId: t.get("transactionId"),
                    items: t.get("items"),
                    subtotal: t.get("subtotal"),
                    total: t.get("total"),
                    paymentMethod: t.get("paymentMethod"),
                    status: t.get("status"),
                    date: t.get("date")
                }));
            });
        } catch (error) {
            console.error("Get user transactions error:", error);
            return [];
        }
    },
    
    async savePaymentMethod(userId, paymentMethod) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId);
                const savedMethods = user.get("savedPaymentMethods") || [];
                
                const exists = savedMethods.some(m => m.last4 === paymentMethod.last4);
                if (!exists) {
                    savedMethods.push({
                        id: Date.now(),
                        last4: paymentMethod.last4,
                        cardType: paymentMethod.cardType,
                        expiry: paymentMethod.expiry,
                        isDefault: savedMethods.length === 0
                    });
                    user.set("savedPaymentMethods", savedMethods);
                    await user.save();
                }
                
                return { success: true, methods: savedMethods };
            });
        } catch (error) {
            console.error("Save payment method error:", error);
            return { success: false, message: error.message };
        }
    },
    
    async getSavedPaymentMethods(userId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId);
                return user.get("savedPaymentMethods") || [];
            });
        } catch (error) {
            console.error("Get payment methods error:", error);
            return [];
        }
    },
    
    async saveAddress(userId, address) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId);
                const addresses = user.get("savedAddresses") || [];
                
                addresses.push({
                    id: Date.now(),
                    ...address,
                    isDefault: addresses.length === 0
                });
                
                user.set("savedAddresses", addresses);
                await user.save();
                
                return { success: true, addresses };
            });
        } catch (error) {
            console.error("Save address error:", error);
            return { success: false, message: error.message };
        }
    },
    
    async getSavedAddresses(userId) {
        try {
            return await withMasterKey(async () => {
                const user = await new Parse.Query(Parse.User).get(userId);
                return user.get("savedAddresses") || [];
            });
        } catch (error) {
            console.error("Get addresses error:", error);
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
                const user = await new Parse.Query(Parse.User).get(userId);
                
                if (updates.email) user.set("email", updates.email);
                if (updates.phone) user.set("phone", updates.phone);
                if (updates.fullName) user.set("fullName", updates.fullName);
                
                await user.save();
                return { success: true };
            });
        } catch (error) {
            console.error("Update consumer profile error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== REVENUE TRACKING ==========
    
    async getBusinessRevenue(businessId) {
        try {
            return await withMasterKey(async () => {
                const Claim = Parse.Object.extend("Claim");
                const query = new Parse.Query(Claim);
                query.equalTo("businessId", businessId);
                query.equalTo("status", "collected");
                
                const claims = await query.find();
                
                let totalRevenue = 0;
                for (const claim of claims) {
                    totalRevenue += claim.get("totalAmount") || 0;
                }
                
                return {
                    totalRevenue: totalRevenue,
                    totalOrders: claims.length,
                    platformFee: 0,
                    netRevenue: totalRevenue
                };
            });
        } catch (error) {
            console.error("Get business revenue error:", error);
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
            console.error("Get near expiry stats error:", error);
            return null;
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
