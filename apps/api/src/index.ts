import express from "express";
import authRoutes from "./routes/auth";
import incomeSourcesRouter from './routes/incomeSources'
import accountRoutes from "./routes/accounts";
import transactionRoutes from "./routes/transactions";
import cookieParser from "cookie-parser";


const app = express();

app.use(express.json()); //middleware to parse JSON request bodies
app.use(cookieParser());
app.use("/auth", authRoutes);
app.use("/income-sources", incomeSourcesRouter);
app.use("/accounts", accountRoutes);
app.use("/transactions", transactionRoutes);



app.get("/", (req, res) => {
    res.send("Financial Litter API is running!");
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});