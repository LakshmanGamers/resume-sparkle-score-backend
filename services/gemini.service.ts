import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { GEMININ_RESUME_REVIEW_PROMPT, GEMINI_JOB_MATCH_PROMPT } from "../constants/prompts";
import dotenv from "dotenv";
import { v4 as uuidv4 } from 'uuid';

// Type definitions moved here to avoid module resolution issues.
interface ResumeReview {
  overall_score: {
    score: number;
    level: string;
    summary: string;
  };
  score_breakdown: {
    category:string;
    score: number;
    weight: number;
    description: string;
  }[];
  detailed_feedback: {
    title: string;
    score: number;
    icon: string;
    strengths: string[];
    issues: string[];
    improvements: string[];
  }[];
  quick_wins: string[];
  industry_benchmarking: any;
  recommendations_by_priority: any;
}

interface JobMatch {
    match_score: {
        score: number;
        level: string;
        summary: string;
    };
    score_breakdown: {
        category: string;
        score: number;
        description: string;
    }[];
    keyword_analysis: {
        missing_keywords: {
            keyword: string;
            importance: string;
            suggestion: string;
        }[];
        matching_keywords: string[];
    };
    experience_alignment: {
        job_requirement: string;
        resume_evidence: string;
        is_match: boolean;
    }[];
    recommendations: {
        area: string;
        suggestion: string;
    }[];
}

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function uploadFile(file: { buffer: Buffer; mimeType: string; }) {
    const formData = new FormData();
    formData.append('file', new Blob([file.buffer], { type: file.mimeType }), `${uuidv4()}-resume`);

    const response = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();
    console.log(`Uploaded file: `, result.file);
    return result.file;
}

async function deleteFile(name: string) {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${name}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'DELETE',
    });
    console.log(`Deleted file ${name}`);
}

function isValidResumeReview(data: any): data is ResumeReview {
    return data &&
           typeof data.overall_score === 'object' &&
           Array.isArray(data.score_breakdown) &&
           Array.isArray(data.detailed_feedback) &&
           Array.isArray(data.quick_wins);
}

function isValidJobMatch(data: any): data is JobMatch {
    return data &&
           typeof data.match_score === 'object' &&
           Array.isArray(data.score_breakdown) &&
           typeof data.keyword_analysis === 'object' &&
           Array.isArray(data.experience_alignment) &&
           Array.isArray(data.recommendations);
}

export async function getResumeReviewFromFile(file: { buffer: Buffer; mimeType: string; }): Promise<ResumeReview> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
    safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
    ],
  });

  const uploadedFile = await uploadFile(file);

  const parts = [
    {
      fileData: {
        mimeType: uploadedFile.mimeType,
        fileUri: uploadedFile.uri,
      },
    },
    {
      text: GEMININ_RESUME_REVIEW_PROMPT,
    },
  ];

  try {
    const result = await model.generateContent({
        contents: [{ role: 'user', parts }]
    });

    const response = await result.response;
    const text = response.text();
    const jsonText = text.replace(/```json\n|```/g, "");
    const parsedData = JSON.parse(jsonText);

    if (!isValidResumeReview(parsedData)) {
        throw new Error("Failed to parse valid resume review data from the API.");
    }
    return parsedData;
  } catch (error) {
    console.log("Error getting resume review from Gemini:", error);
    throw new Error("Failed to get resume review.");
  } finally {
    await deleteFile(uploadedFile.name);
  }
}

export async function getJobMatchFromFileAndDescription(file: { buffer: Buffer; mimeType: string; }, jobDescription: string): Promise<JobMatch> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
    safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
    ],
  });

  const uploadedFile = await uploadFile(file);

  const parts = [
    {
      fileData: {
        mimeType: uploadedFile.mimeType,
        fileUri: uploadedFile.uri,
      },
    },
    {
      text: `JOB DESCRIPTION: ${jobDescription}`,
    },
    {
      text: GEMINI_JOB_MATCH_PROMPT,
    },
  ];

  try {
    const result = await model.generateContent({
        contents: [{ role: 'user', parts }]
    });

    const response = await result.response;
    const text = response.text();
    const jsonText = text.replace(/```json\n|```/g, "");
    const parsedData = JSON.parse(jsonText);
    
    if (!isValidJobMatch(parsedData)) {
      throw new Error("Failed to parse valid job match data from the API.");
    }
    return parsedData;
  } catch (error) {
    console.log("Error getting job match from Gemini:", error);
    
    throw new Error("Failed to get job match.");
  } finally {
    await deleteFile(uploadedFile.name);
  }
}