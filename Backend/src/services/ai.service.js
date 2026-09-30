const Groq = require("groq-sdk")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
})

// Check console.groq.com/docs/models for currently available models
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

// keep prompts within free-tier token limits
const MAX_RESUME_CHARS = 12000


const questionSchema = z.object({
    question: z.string().describe("The question that can be asked in the interview"),
    intention: z.string().describe("The intention of the interviewer behind asking this question"),
    answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
})

const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job description"),
    technicalQuestions: z.array(questionSchema).describe("Technical questions that can be asked in the interview"),
    behavioralQuestions: z.array(questionSchema).describe("Behavioral questions that can be asked in the interview"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("How important this skill gap is for the job")
    })).describe("List of skill gaps in the candidate's profile"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day"),
        tasks: z.array(z.string()).describe("Tasks to be done on this day")
    })).describe("A day-wise preparation plan"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

const resumePdfSchema = z.object({
    html: z.string().describe("The full HTML content of the resume, ready to be converted to PDF")
})


/**
 * Calls Groq in JSON mode, then validates the result with the given zod schema.
 * Groq's JSON mode needs the word "JSON" in the prompt, and the schema is
 * included in the prompt so the model knows the exact shape to return.
 */
async function generateJson({ prompt, schema }) {
    const jsonSchema = zodToJsonSchema(schema)
    delete jsonSchema.$schema

    const completion = await groq.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content:
                    "You are an expert career coach. Respond ONLY with a valid JSON object " +
                    "that matches this JSON schema exactly. No markdown, no extra text.\n\n" +
                    JSON.stringify(jsonSchema)
            },
            { role: "user", content: prompt }
        ]
    })

    const text = completion.choices[ 0 ]?.message?.content

    if (!text) {
        throw new Error("Groq returned an empty response")
    }

    return schema.parse(JSON.parse(text))
}


async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

    const prompt = `Generate an interview report for a candidate with the following details:
Resume: ${(resume || "").slice(0, MAX_RESUME_CHARS)}
Self Description: ${selfDescription || ""}
Job Description: ${jobDescription || ""}

Include at least 5 technical questions, 4 behavioral questions, the main skill gaps, and a 7-day preparation plan.`

    return generateJson({ prompt, schema: interviewReportSchema })
}


async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch()

    try {
        const page = await browser.newPage()
        await page.setContent(htmlContent, { waitUntil: "networkidle0" })

        const pdfBuffer = await page.pdf({
            format: "A4",
            margin: {
                top: "20mm",
                bottom: "20mm",
                left: "15mm",
                right: "15mm"
            }
        })

        return pdfBuffer
    } finally {
        await browser.close()
    }
}


async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const prompt = `Generate a resume for a candidate with the following details:
Resume: ${(resume || "").slice(0, MAX_RESUME_CHARS)}
Self Description: ${selfDescription || ""}
Job Description: ${jobDescription || ""}

Return a JSON object with a single field "html" containing the complete HTML of the resume.
The resume should be tailored for the given job description and highlight the candidate's strengths and relevant experience.
It must be well-formatted, simple and professional, and should not sound AI-generated.
Keep it ATS friendly (easily parsable, no images or complex layouts) and 1-2 pages long when converted to PDF.
Use inline CSS only. You may use subtle colors or font styles for emphasis.`

    const { html } = await generateJson({ prompt, schema: resumePdfSchema })

    return generatePdfFromHtml(html)
}

module.exports = { generateInterviewReport, generateResumePdf }