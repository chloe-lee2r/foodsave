function requireAuth(requiredRole) {
    const user = Parse.User.current();

    if (!user) {
        location.href = "login.html";
        return;
    }

    const role = user.get("role");

    if (requiredRole && role !== requiredRole) {
        alert("Access denied");
        location.href = "login.html";
    }
}
