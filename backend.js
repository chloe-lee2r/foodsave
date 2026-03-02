// ===============================
// BACKEND CONNECTOR (Back4App Ready)
// Replace keys later
// ===============================

const Backend = {
    // Toggle this to false once Back4App keys added
    useLocalFallback: true,

    async register(username, password, role) {
        if (this.useLocalFallback) {
            return this.localRegister(username, password, role);
        }

        // BACK4APP VERSION (add later)
        /*
        const user = new Parse.User();
        user.set("username", username);
        user.set("password", password);
        user.set("role", role);

        try {
            await user.signUp();
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
        */
    },

    async login(username, password, role) {
        if (this.useLocalFallback) {
            return this.localLogin(username, password, role);
        }

        // BACK4APP VERSION
        /*
        try {
            const user = await Parse.User.logIn(username, password);

            if (user.get("role") !== role) {
                return { success: false, message: "Wrong login type" };
            }

            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
        */
    },

    // ===============================
    // LOCAL STORAGE FALLBACK
    // ===============================
    localRegister(username, password, role) {
        const users = JSON.parse(localStorage.getItem("users")) || [];

        if (users.find(u => u.username === username)) {
            return { success: false, message: "User already exists" };
        }

        users.push({ username, password, role });
        localStorage.setItem("users", JSON.stringify(users));
        return { success: true };
    },

    localLogin(username, password, role) {
        const users = JSON.parse(localStorage.getItem("users")) || [];

        const found = users.find(
            u => u.username === username &&
                 u.password === password &&
                 u.role === role
        );

        if (!found) {
            return { success: false, message: "Invalid login" };
        }

        return { success: true };
    }
};
