// cloud/main.js - Deploy this entire file to Back4App Cloud Code

Parse.Cloud.useMasterKey();

// ========== VALIDATION FUNCTIONS ==========

Parse.Cloud.define("checkUsernameExists", async (request) => {
    const { username } = request.params;
    const query = new Parse.Query(Parse.User);
    query.equalTo("username", username);
    const user = await query.first({ useMasterKey: true });
    return { exists: !!user };
});

Parse.Cloud.define("checkBusinessNameExists", async (request) => {
    const { businessName } = request.params;
    const query = new Parse.Query(Parse.User);
    query.equalTo("businessName", businessName);
    const user = await query.first({ useMasterKey: true });
    return { exists: !!user };
});

// ========== ORDER SYSTEM ==========

Parse.Cloud.define("createOrder", async (request) => {
    const { items, totalAmount, userId } = request.params;
    
    try {
        const userQuery = new Parse.Query(Parse.User);
        const currentUser = await userQuery.get(userId, { useMasterKey: true });
        
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

        const walletBalance = currentUser.get("walletBalance") || 0;
        if (walletBalance < totalAmount) {
            return { success: false, message: `Insufficient balance. Need $${totalAmount.toFixed(2)}` };
        }

        // Verify all items
        const verifiedItems = [];
        const Ad = Parse.Object.extend("Advertisement");
        
        for (const item of orderItems) {
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
                ad,
                item,
                discountedPrice,
                businessId: ad.get("businessId"),
                businessName: ad.get("businessName"),
                originalPrice,
                discount,
                itemTotal
            });
        }

        if (verifiedItems.length === 0) {
            return { success: false, message: "No valid items in cart" };
        }

        // Deduct money
        const newBalance = walletBalance - totalAmount;
        currentUser.set("walletBalance", newBalance);
        await currentUser.save(null, { useMasterKey: true });

        const createdOrders = [];
        const Order = Parse.Object.extend("Order");
        
        for (const verified of verifiedItems) {
            const { ad, item, discountedPrice, businessId, businessName, originalPrice, discount, itemTotal } = verified;
            
            const newQuantityLeft = ad.get("quantityLeft") - item.quantity;
            ad.set("quantityLeft", newQuantityLeft);
            ad.increment("claimed", item.quantity);
            if (newQuantityLeft === 0) {
                ad.set("active", false);
            }
            await ad.save(null, { useMasterKey: true });
            
            const order = new Order();
            order.set("adId", ad.id);
            order.set("businessId", businessId);
            order.set("businessName", businessName);
            order.set("consumerId", currentUser.id);
            order.set("consumerName", currentUser.get("username"));
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
            
            const businessUser = await userQuery.get(businessId, { useMasterKey: true });
            const currentPending = businessUser.get("pendingWalletBalance") || 0;
            businessUser.set("pendingWalletBalance", currentPending + itemTotal);
            await businessUser.save(null, { useMasterKey: true });
            
            // Send notification to business
            const Notification = Parse.Object.extend("Notification");
            const notification = new Notification();
            notification.set("businessId", businessId);
            notification.set("message", `🛒 New order! ${currentUser.get("username")} ordered ${item.quantity}x ${ad.get("foodName")} - $${itemTotal.toFixed(2)}`);
            notification.set("read", false);
            notification.set("createdAt", new Date());
            await notification.save(null, { useMasterKey: true });
        }
        
        return {
            success: true,
            message: `Order placed successfully! ${createdOrders.length} item(s) purchased.`,
            orders: createdOrders,
            newBalance: newBalance,
            totalPaid: totalAmount
        };
        
    } catch (error) {
        console.error("Create order error:", error);
        return { success: false, message: error.message || "Checkout failed" };
    }
});

// ========== ORDER CONFIRMATION FUNCTIONS ==========

Parse.Cloud.define("confirmOrderByBusiness", async (request) => {
    const { orderId, businessId } = request.params;
    
    try {
        const Order = Parse.Object.extend("Order");
        const query = new Parse.Query(Order);
        const order = await query.get(orderId, { useMasterKey: true });
        
        if (!order) {
            return { success: false, message: "Order not found" };
        }
        
        if (order.get("businessId") !== businessId) {
            return { success: false, message: "Unauthorized - This is not your order" };
        }
        
        if (order.get("status") !== "pending") {
            return { success: false, message: "Order already processed" };
        }
        
        order.set("status", "confirmed_by_business");
        await order.save(null, { useMasterKey: true });
        
        // Send notification to consumer
        const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
        const notification = new ConsumerNotification();
        notification.set("consumerId", order.get("consumerId"));
        notification.set("message", `✅ Your order "${order.get("foodName")}" is ready for pickup!`);
        notification.set("read", false);
        notification.set("createdAt", new Date());
        await notification.save(null, { useMasterKey: true });
        
        return { success: true, message: "Order confirmed! Customer notified." };
    } catch (error) {
        console.error("confirmOrderByBusiness error:", error);
        return { success: false, message: error.message };
    }
});

Parse.Cloud.define("confirmCollectedByCustomer", async (request) => {
    const { orderId, consumerId } = request.params;
    
    try {
        const Order = Parse.Object.extend("Order");
        const orderQuery = new Parse.Query(Order);
        const order = await orderQuery.get(orderId, { useMasterKey: true });
        
        if (!order) {
            return { success: false, message: "Order not found" };
        }
        
        if (order.get("consumerId") !== consumerId) {
            return { success: false, message: "Unauthorized - This is not your order" };
        }
        
        if (order.get("status") !== "confirmed_by_business") {
            return { success: false, message: "Order must be confirmed by business first" };
        }
        
        const businessUserQuery = new Parse.Query(Parse.User);
        const businessUser = await businessUserQuery.get(order.get("businessId"), { useMasterKey: true });
        
        const pendingBalance = businessUser.get("pendingWalletBalance") || 0;
        const currentBalance = businessUser.get("businessWalletBalance") || 0;
        const orderAmount = order.get("totalAmount") || 0;
        
        order.set("status", "collected_by_customer");
        await order.save(null, { useMasterKey: true });
        
        businessUser.set("pendingWalletBalance", pendingBalance - orderAmount);
        businessUser.set("businessWalletBalance", currentBalance + orderAmount);
        await businessUser.save(null, { useMasterKey: true });
        
        // Send notification to business
        const Notification = Parse.Object.extend("Notification");
        const notification = new Notification();
        notification.set("businessId", order.get("businessId"));
        notification.set("message", `💰 Payment released! Customer collected ${order.get("foodName")}. $${orderAmount.toFixed(2)} added to wallet.`);
        notification.set("read", false);
        notification.set("createdAt", new Date());
        await notification.save(null, { useMasterKey: true });
        
        return { success: true, message: "Pickup confirmed! Payment released to business." };
    } catch (error) {
        console.error("confirmCollectedByCustomer error:", error);
        return { success: false, message: error.message };
    }
});

// ========== ORDER RETRIEVAL FUNCTIONS ==========

Parse.Cloud.define("getOrdersForBusiness", async (request) => {
    const { businessId } = request.params;
    
    try {
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
    } catch (error) {
        return [];
    }
});

Parse.Cloud.define("getConsumerOrders", async (request) => {
    const { consumerId } = request.params;
    
    try {
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
    } catch (error) {
        return [];
    }
});

// ========== WALLET FUNCTIONS ==========

Parse.Cloud.define("addToWallet", async (request) => {
    const { userId, amount } = request.params;
    
    try {
        const query = new Parse.Query(Parse.User);
        const user = await query.get(userId, { useMasterKey: true });
        const currentBalance = user.get("walletBalance") || 0;
        user.set("walletBalance", currentBalance + amount);
        await user.save(null, { useMasterKey: true });
        return { success: true, newBalance: currentBalance + amount };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

Parse.Cloud.define("getWalletBalance", async (request) => {
    const { userId } = request.params;
    
    try {
        const query = new Parse.Query(Parse.User);
        const user = await query.get(userId, { useMasterKey: true });
        return { balance: user.get("walletBalance") || 0 };
    } catch (error) {
        return { balance: 0 };
    }
});

// ========== PROFILE PICTURE FUNCTIONS ==========

Parse.Cloud.define("uploadProfilePicture", async (request) => {
    const { userId, imageBase64 } = request.params;
    
    try {
        const query = new Parse.Query(Parse.User);
        const user = await query.get(userId, { useMasterKey: true });
        user.set("profilePicture", imageBase64);
        await user.save(null, { useMasterKey: true });
        return { success: true, profilePicture: imageBase64 };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

Parse.Cloud.define("getProfilePicture", async (request) => {
    const { userId } = request.params;
    
    try {
        const query = new Parse.Query(Parse.User);
        const user = await query.get(userId, { useMasterKey: true });
        return { profilePicture: user.get("profilePicture") || null };
    } catch (error) {
        return { profilePicture: null };
    }
});

// ========== ADVERTISEMENT FUNCTIONS ==========

Parse.Cloud.define("createAd", async (request) => {
    const { adData, businessId } = request.params;
    
    try {
        const userQuery = new Parse.Query(Parse.User);
        const businessUser = await userQuery.get(businessId, { useMasterKey: true });
        
        if (!businessUser.get("businessVerified")) {
            return { success: false, message: "Business must be verified to post ads" };
        }
        
        const Ad = Parse.Object.extend("Advertisement");
        const ad = new Ad();
        ad.set("foodName", adData.foodName);
        ad.set("discount", parseFloat(adData.discount));
        ad.set("offerEnds", new Date(adData.offerEnds));
        ad.set("batchExpiryDate", new Date(adData.batchExpiryDate));
        ad.set("businessName", businessUser.get("businessName"));
        ad.set("businessId", businessId);
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
        return { success: true, adId: ad.id };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

Parse.Cloud.define("getActiveAds", async (request) => {
    const { category, search, limit } = request.params;
    
    try {
        const Ad = Parse.Object.extend("Advertisement");
        const query = new Parse.Query(Ad);
        query.equalTo("active", true);
        query.greaterThan("offerEnds", new Date());
        query.greaterThan("quantityLeft", 0);
        query.descending("createdAt");
        
        if (category && category !== 'all') {
            query.equalTo("category", category);
        }
        if (search) {
            query.matches("foodName", new RegExp(search, "i"));
        }
        query.limit(limit || 100);
        
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
    } catch (error) {
        return [];
    }
});

Parse.Cloud.define("getShopAds", async (request) => {
    const { businessId } = request.params;
    
    try {
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
    } catch (error) {
        return [];
    }
});

Parse.Cloud.define("deleteAd", async (request) => {
    const { adId, businessId } = request.params;
    
    try {
        const Ad = Parse.Object.extend("Advertisement");
        const query = new Parse.Query(Ad);
        const ad = await query.get(adId, { useMasterKey: true });
        
        if (ad.get("businessId") !== businessId) {
            return { success: false, message: "Unauthorized" };
        }
        
        await ad.destroy({ useMasterKey: true });
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

Parse.Cloud.define("updateAd", async (request) => {
    const { adId, businessId, updates } = request.params;
    
    try {
        const Ad = Parse.Object.extend("Advertisement");
        const query = new Parse.Query(Ad);
        const ad = await query.get(adId, { useMasterKey: true });
        
        if (ad.get("businessId") !== businessId) {
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
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// ========== FRIDGE FUNCTIONS ==========

Parse.Cloud.define("saveFridgeItems", async (request) => {
    const { userId, items } = request.params;
    
    try {
        const Fridge = Parse.Object.extend("Fridge");
        const query = new Parse.Query(Fridge);
        query.equalTo("userId", userId);
        const oldItems = await query.find({ useMasterKey: true });
        await Parse.Object.destroyAll(oldItems, { useMasterKey: true });
        
        const newItems = items.map(item => {
            const fridgeItem = new Fridge();
            fridgeItem.set("userId", userId);
            fridgeItem.set("name", item.name);
            fridgeItem.set("expiryDate", new Date(item.expiry));
            fridgeItem.set("category", item.category || "other");
            return fridgeItem;
        });
        
        await Parse.Object.saveAll(newItems, { useMasterKey: true });
        return { success: true };
    } catch (error) {
        return { success: false };
    }
});

Parse.Cloud.define("loadFridgeItems", async (request) => {
    const { userId } = request.params;
    
    try {
        const Fridge = Parse.Object.extend("Fridge");
        const query = new Parse.Query(Fridge);
        query.equalTo("userId", userId);
        const items = await query.find({ useMasterKey: true });
        return items.map(item => ({
            name: item.get("name"),
            expiry: item.get("expiryDate").toISOString().split('T')[0],
            category: item.get("category")
        }));
    } catch (error) {
        return [];
    }
});

// ========== SHOPPING LIST FUNCTIONS ==========

Parse.Cloud.define("saveShoppingLists", async (request) => {
    const { userId, lists } = request.params;
    
    try {
        const ShoppingLists = Parse.Object.extend("ShoppingLists");
        const query = new Parse.Query(ShoppingLists);
        query.equalTo("userId", userId);
        const oldLists = await query.find({ useMasterKey: true });
        await Parse.Object.destroyAll(oldLists, { useMasterKey: true });
        
        const newLists = new ShoppingLists();
        newLists.set("userId", userId);
        newLists.set("lists", JSON.stringify(lists));
        newLists.set("lastUpdated", new Date());
        await newLists.save(null, { useMasterKey: true });
        return { success: true };
    } catch (error) {
        return { success: false };
    }
});

Parse.Cloud.define("loadShoppingLists", async (request) => {
    const { userId } = request.params;
    
    try {
        const ShoppingLists = Parse.Object.extend("ShoppingLists");
        const query = new Parse.Query(ShoppingLists);
        query.equalTo("userId", userId);
        const result = await query.first({ useMasterKey: true });
        return result ? JSON.parse(result.get("lists")) : null;
    } catch (error) {
        return null;
    }
});

// ========== BUSINESS PROFILE FUNCTIONS ==========

Parse.Cloud.define("getBusinessProfile", async (request) => {
    const { businessId } = request.params;
    
    try {
        const query = new Parse.Query(Parse.User);
        const user = await query.get(businessId, { useMasterKey: true });
        return {
            id: user.id,
            username: user.get("username"),
            businessName: user.get("businessName"),
            businessPhone: user.get("businessPhone"),
            businessEmail: user.get("businessEmail"),
            businessAddress: user.get("businessAddress"),
            businessLat: user.get("businessLat"),
            businessLng: user.get("businessLng"),
            businessOpen: user.get("businessOpen"),
            businessClose: user.get("businessClose"),
            businessType: user.get("businessType"),
            businessVerified: user.get("businessVerified"),
            businessRole: user.get("businessRole"),
            businessWalletBalance: user.get("businessWalletBalance") || 0,
            pendingWalletBalance: user.get("pendingWalletBalance") || 0
        };
    } catch (error) {
        return null;
    }
});

// ========== CONSUMER PROFILE FUNCTIONS ==========

Parse.Cloud.define("updateConsumerProfile", async (request) => {
    const { userId, updates } = request.params;
    
    try {
        const query = new Parse.Query(Parse.User);
        const user = await query.get(userId, { useMasterKey: true });
        if (updates.email) user.set("email", updates.email);
        if (updates.phone) user.set("phone", updates.phone);
        if (updates.fullName) user.set("fullName", updates.fullName);
        await user.save(null, { useMasterKey: true });
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});
