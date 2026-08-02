import express from "express";
import authRoutes from "./routes/auth";

const app = express();

app.use(express.json());
app.use("/auth", authRoutes);

app.get("/", (req, res) => {
    res.send("Financial Litter API is running!");
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});