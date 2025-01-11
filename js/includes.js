document.addEventListener("DOMContentLoaded", function () {
    // Include the navbar
    fetch("navbar.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("navbar").innerHTML = data;

            // Dynamically add navbar.css to current page
            const navbarStyles = document.createElement("link");
            navbarStyles.rel = "stylesheet";
            navbarStyles.href = "css/navbar.css";
            document.head.appendChild(navbarStyles);
        });

    // Include the footer
    fetch("footer.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("footer").innerHTML = data;

            // Dynamically add footer.css to the current page
            const footerStyles = document.createElement("link");
            footerStyles.rel = "stylesheet";
            footerStyles.href = "css/footer.css";
            document.head.appendChild(footerStyles);
        });
});
