import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { getResumeReviewFromFile, getJobMatchFromFileAndDescription } from './services/gemini.service';
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                 // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,    // `RateLimit-*` headers
  legacyHeaders: false,     // Disable `X-RateLimit-*` headers
  skip : (req: Request, res: Response) => { 
    return req.method === "GET" || req.path === "/";
  }
});


dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1); // <-- Add this line here


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
const corsOptions = {
  origin: process.env.FRONTEND_URL,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(limiter);

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('IP:', req.ip);
  next();
});


app.get('/', (req: Request, res: Response) => {
  res.send('Hello from the backend!');
});

app.post('/review', upload.single('resume'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).send('No file uploaded.');
      return;
    }

    const review = await getResumeReviewFromFile({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    res.json(review);
  } catch (error: any) {
    next(error);
  }
});

app.post('/job-match', upload.single('resume'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).send('No file uploaded.');
      return;
    }

    const jobDescription = req.body.jobDescription;
    if (!jobDescription) {
      res.status(400).send('No job description provided.');
      return;
    }

    const match = await getJobMatchFromFileAndDescription({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    }, jobDescription);
    res.json(match);
  } catch (error: any) {
    next(error);
  }
});

// A basic error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke! ' + err.message);
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

