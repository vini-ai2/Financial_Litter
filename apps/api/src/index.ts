import express from "express";
import authRoutes from "./routes/auth";
import incomeSourcesRouter from './routes/incomeSources'
import accountRoutes from "./routes/accounts";
import transactionRoutes from "./routes/transactions";
import financeRoutes from "./routes/finance";
import cookieParser from "cookie-parser";
import cors from 'cors'


const app = express();
app.use(cors({
  // Vite may be opened through either hostname; both are distinct browser origins.
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}))

app.use(express.json()); //middleware to parse JSON request bodies
app.use(cookieParser());
app.use("/auth", authRoutes);
app.use("/income-sources", incomeSourcesRouter);
app.use("/accounts", accountRoutes);
app.use("/transactions", transactionRoutes);
app.use("/finance", financeRoutes);



app.get("/", (req, res) => {
    res.send("Financial Litter API is running!");
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
