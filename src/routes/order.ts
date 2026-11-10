import {Router} from "express";
import {z} from "zod";
import {pool} from "../db";
import { PG_ERRORS } from "../utils";

export const ordersRouter = Router();

const createOrderSchema = z.object({
    userId: z.number().int().positive(),
    symbol: z.string().trim().min(1),
    quantity: z.number().int().positive(),
    price: z.number().positive()
})

ordersRouter.post('/', async (req, res) => {
    // step 1 check the unique key, if not available in the header return error
    const key = req.header('Idempotency-Key');
    if (!key) {
        return res.status(400).json({ error: 'Idempotency Key header is required.' })
    }
    // step 2 check the data is right or not, if so return error
    const parsed = createOrderSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues })
    }
    // step 3 parse the data from the data
    const { userId, symbol, quantity, price } = parsed.data

    // step 4 borrow a connection, so that you run whole transaction on the same connection
    const client = await pool.connect();
    try {
        // step 5 start the transaction and insert the orders
        await client.query('begin');
        const inserted = await client.query("insert into orders (user_id, symbol, quantity, price, idempotency_key) values ($1, $2, $3, $4, $5) on conflict (idempotency_key) do nothing returning *", [userId, symbol, quantity, price, key]);
        
        // step 6 if nothing is inserted then rollback and response with existing data
        if (inserted.rows.length === 0) {
            await client.query("rollback");
            const existing = await pool.query(
                "select * from orders where idempotency_key = $1",
                [key]
            );
            return res.status(200).json(existing.rows[0]);
        }
        // step 7 calculate require amount if available in balance then deduct else rollback and return insufficient balance error.  
        const paid = await client.query("update users set balance = balance - ($2::numeric * $3::numeric) where id = $1 and balance >= ($2::numeric * $3::numeric)", [userId, quantity, price]);
        
        if (paid.rowCount === 0) {
            await client.query("rollback");
            return res.status(400).json({ error: "Insufficient Balance" });
        }
        // step 8 if all goes through then commit the transaction and response with the newly added order

        await client.query("commit");
        return res.status(201).json(inserted.rows[0]);
    } catch (error) {
       // error step : in case of any unprecedented error just rollback whole thing and response with error
        await client.query("rollback");
        if (error.code === PG_ERRORS.FOREIGN_KEY_VIOLATION) {
            return res.status(400).json({ error: "User does not exist" });
        }
        console.error(error);
        res.status(500).json({ error: "Something went wrong" });
    } finally {
        // finally release the connection that you acquired, regardless of transaction goes through or not.
        client.release()
    }
})