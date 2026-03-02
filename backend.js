// ===============================
// BACK4APP CONFIGURATION
// ===============================

// 1️⃣ Include Parse SDK in your HTML BEFORE backend.js:
// <script src="https://npmcdn.com/parse/dist/parse.min.js"></script>

Parse.initialize(
    "qMx3AJogl2rGNkcT2bnnBYzS2zQoXKjZYGEUcAg", // Application ID
    "IsAcXogzafbrBpvseDfAB189zAxeUfbwUgXBMeI5"  // JavaScript Key
);

Parse.serverURL = "https://parseapi.back4app.com/";

// ===============================
// BACKEND LOGIC
// ===============================

const Backend = {

    async register(username, password, role) {
        const user = new Parse.User();

        user.set("username", username);
        user.set("password", password);
        user.set("role", role); // custom field

        try {
            await user.signUp();
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
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

            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async logout() {
        await Parse.User.logOut();
    },

    getCurrentUser() {
        return Parse.User.current();
    }
};
