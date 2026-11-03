// Default layouts for the Report Template Manager.
// Nursery layouts derived from De-Bright Group of Schools templates.

export type RatingLevel = { code: string; label: string; description?: string };
export type CompetencyArea = { id: string; title: string; items: string[] };
export type GradeBand = { grade: string; min: number; max: number; remark: string };

/** Dynamic behavioural / co-curricular assessment section. */
export type AssessmentSection = { id: string; title: string; items: string[] };

export interface TemplateLayout {
  kind: "competency" | "score" | "hybrid";
  header?: {
    schoolName?: string;
    address?: string;
    tagline?: string;
    session?: string;
    term?: string;
    theme?: string;
    showLogo?: boolean;
    showPhoto?: boolean;
    showAdmissionNumber?: boolean;
    showAge?: boolean;
    showClassTeacher?: boolean;
    showAttendance?: boolean;
    showDaysOpen?: boolean;
    showDaysAbsent?: boolean;
  };
  ratingScale?: RatingLevel[];      // competency layouts + additional sections
  gradeScale?: GradeBand[];         // score layouts
  competencyAreas?: CompetencyArea[];
  /** Dynamic behavioural / co-curricular sections shown below academics. */
  assessmentSections?: AssessmentSection[];
  /** Placeholder subject rows for score preview when no real data present. */
  subjectsPlaceholder?: string[];
  summary?: {
    showTotalSubjects?: boolean;
    showObtainable?: boolean;
    showObtained?: boolean;
    showAverage?: boolean;
    showClassAverage?: boolean;
    showPosition?: boolean;
  };
  signatures?: {
    teacherName?: string;
    showTeacherSignature?: boolean;
    showDirectorSignature?: boolean;
    showPrincipalSignature?: boolean;
    showVacationDate?: boolean;
    showResumptionDate?: boolean;
  };
  comments?: {
    teacherPrompt?: string;
    principalPrompt?: string;
    directorPrompt?: string;
    showAttendance?: boolean;
    showNextTermDate?: boolean;
  };
  footerNote?: string;
}

const uid = () => crypto.randomUUID();

export const NURSERY_RATING: RatingLevel[] = [
  { code: "3", label: "Excellent",  description: "Consistently demonstrates the skill" },
  { code: "2", label: "Developing", description: "Sometimes demonstrates the skill" },
  { code: "1", label: "Beginning",  description: "Rarely demonstrates the skill" },
];

export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { grade: "A", min: 70, max: 100, remark: "Excellent" },
  { grade: "B", min: 60, max: 69,  remark: "Very Good" },
  { grade: "C", min: 50, max: 59,  remark: "Good" },
  { grade: "D", min: 45, max: 49,  remark: "Pass" },
  { grade: "E", min: 40, max: 44,  remark: "Weak Pass" },
  { grade: "F", min: 0,  max: 39,  remark: "Fail" },
];

export const NURSERY_GLITTERS_ONE: TemplateLayout = {
  kind: "competency",
  header: { schoolName: "De-Bright Group of Schools", tagline: "3rd Term Assessment Report" },
  ratingScale: NURSERY_RATING,
  competencyAreas: [
    {
      id: uid(),
      title: "Mathematical Development",
      items: [
        "Can count numbers up to 900",
        "Can count numbers backward from 100 to 0",
        "Can write numbers 1 to 900 independently",
        "Can skip count numbers in 5s and 10s up to 100",
        "Can recite the 2 times multiplication table",
        "Can recognise and set the time to o'clock and half past",
        "Understands that a fraction is a part of a whole",
        "Can subtract smaller numbers from bigger numbers using objects",
        "Can write numbers in words up to 10",
        "Can compare and order numbers up to 100",
        "Can identify odd and even numbers",
      ],
    },
    {
      id: uid(),
      title: "Literacy Skills",
      items: [
        "Can identify and write Jolly Phonics letter sounds (structures 1–7)",
        "Can identify beginning, middle and ending sounds in spoken words",
        "Can identify and write small letters a–z",
        "Can read and write any three-letter word fluently",
        "Can blend/read 4–6 letter words using Jolly Phonics sounds",
        "Can write his/her first name",
        "Can identify simple sight words (the, to, so, we, she)",
      ],
    },
    {
      id: uid(),
      title: "Communication & Language",
      items: [
        "Can say aloud, sing and demonstrate Jolly Phonics sounds",
        "Can sit and listen with enjoyment to short stories",
        "Can name simple pronouns and use them correctly",
        "Can read simple sentences using punctuation",
        "Understands singular and plural nouns",
      ],
    },
    {
      id: uid(),
      title: "Personal, Social & Emotional Development",
      items: [
        "Shows kindness and respect to peers and adults",
        "Can share and take turns",
        "Follows classroom rules and routines",
      ],
    },
    {
      id: uid(),
      title: "Physical Development",
      items: [
        "Can walk on tip-toe",
        "Can balance on one foot for approximately five seconds",
        "Can do 2–5 push-ups",
        "Can practice dressing up independently",
      ],
    },
    {
      id: uid(),
      title: "Expressive Art & Design",
      items: [
        "Can do a sponge painting",
        "Can draw shapes and symbols from memory",
      ],
    },
    {
      id: uid(),
      title: "Penmanship",
      items: [
        "Can write all 26 small letters of the alphabet",
        "Can write the 42 Jolly Phonics letter sounds",
        "Uses the tripod grip while writing or colouring",
        "Can copy words and sentences from the board independently",
      ],
    },
  ],
  comments: {
    teacherPrompt: "Class teacher's comment",
    principalPrompt: "Head teacher's comment",
    showAttendance: true,
    showNextTermDate: true,
  },
  footerNote: "This report reflects the child's development at the end of the term.",
};

export const NURSERY_GLITTERS_TWO: TemplateLayout = {
  kind: "competency",
  header: { schoolName: "De-Bright Group of Schools", tagline: "3rd Term Assessment Report" },
  ratingScale: NURSERY_RATING,
  competencyAreas: [
    {
      id: uid(),
      title: "Problem Solving, Reasoning and Numeracy",
      items: [
        "Understands the meaning of Roman Numerals",
        "Can write numbers 1–10 in Roman Numerals and vice versa",
        "Can show the place value of numbers up to 9,999",
        "Can add up to 2 digits by 2 digits with regrouping",
        "Can tell the time o'clock, half past, quarter past and quarter to",
        "Understands multiplication as continuous addition",
        "Can multiply 2 digits by 1 digit without regrouping",
        "Can share objects equally as division",
        "Can solve simple addition and subtraction word problems",
      ],
    },
    {
      id: uid(),
      title: "Communication and Language",
      items: [
        "Understands and uses punctuation marks correctly",
        "Understands tenses and uses them appropriately",
        "Can write simple sentences as composition/creative writing",
        "Understands articles a/an",
        "Can read tricky words up to level 5 and form sentences",
        "Can identify prefixes and suffixes in given words",
        "Understands describing words and gives examples",
      ],
    },
    {
      id: uid(),
      title: "Personal, Social and Emotional Development",
      items: [
        "Can explain the meaning of community helpers",
        "Can describe who professionals are",
        "Understands vulnerable children and orphans",
        "Can discuss the meaning of physical violence",
        "Can mention up to 3 classes of food",
      ],
    },
    {
      id: uid(),
      title: "Understanding the World",
      items: [
        "Can talk about the world in reference to land, water and air",
        "Can mention the importance of the sun",
        "Understands weather and its types",
        "Understands the meaning of landmarks",
        "Can discuss modes and means of transportation",
      ],
    },
    {
      id: uid(),
      title: "Penmanship",
      items: [
        "Displays good pincer grip during letter formation",
        "Writes upper case and lower case letters appropriately",
        "Shows consistent spacing between letters and words",
      ],
    },
    {
      id: uid(),
      title: "Creative Art and Design",
      items: [
        "Makes choices that enhance communication of ideas",
        "Identifies uses of art in personal environment",
        "Creates art that tells a story about a life experience",
      ],
    },
  ],
  comments: {
    teacherPrompt: "Class teacher's comment",
    principalPrompt: "Head teacher's comment",
    showAttendance: true,
    showNextTermDate: true,
  },
};

export const PRIMARY_SCORE_DEFAULT: TemplateLayout = {
  kind: "score",
  header: {
    schoolName: "De-Bright Group of Schools",
    address: "50 4th Ave, Festac Town, Lagos 102102, Lagos",
    tagline: "Terminal Report Sheet",
    showLogo: true,
    showPhoto: true,
    showAdmissionNumber: true,
    showClassTeacher: true,
    showAttendance: true,
    showDaysOpen: true,
    showDaysAbsent: true,
  },
  gradeScale: DEFAULT_GRADE_SCALE,
  subjectsPlaceholder: [
    "English Language", "Mathematics", "Basic Science", "Social Studies",
    "Civic Education", "History", "Geography", "I.C.T", "French", "Music",
  ],
  assessmentSections: [
    { id: uid(), title: "Conduct & Work Habit", items: [
      "Respectful and cordial (peers and Adult)",
      "Independence & Organized",
      "Maintains appropriate behaviour without prompting",
      "Exhibits eagerness & curiosity as a learner",
      "Participate actively in class",
      "Collaborates with other children for learning",
      "Persevere at a challenging task",
      "Daily work reflects best effort",
      "Leadership skills",
      "Public presentation skills",
    ] },
    { id: uid(), title: "Handwriting", items: [
      "Writes numerals and letters correctly",
      "Uses correct letter placement/spacing",
      "Prints neatly",
    ] },
    { id: uid(), title: "Diction", items: [
      "Enunciation", "Pronounciation", "Public speaking", "Etiquette and poise",
    ] },
    { id: uid(), title: "Home Performance Indicies", items: [
      "Punctuality", "Neatness", "PTC attendance",
      "Quality of homework submitted", "Prompt submission of homework",
    ] },
    { id: uid(), title: "Library", items: [
      "Handles books properly", "Return books in good order",
      "Uses the facility without prompting", "Adhere to rules",
    ] },
    { id: uid(), title: "Enrichment Activities", items: [
      "Computer", "French", "Arts & Craft", "Taekwondo",
      "Cookery", "Ballet", "Swimming", "Chess", "Music",
    ] },
  ],
  summary: {
    showTotalSubjects: true,
    showObtainable: true,
    showObtained: true,
    showAverage: true,
    showClassAverage: true,
    showPosition: true,
  },
  signatures: {
    showTeacherSignature: true,
    showDirectorSignature: true,
    showVacationDate: true,
    showResumptionDate: true,
  },
  comments: {
    teacherPrompt: "Teacher's Remark",
    directorPrompt: "Director of Studies' Remark",
    principalPrompt: "Principal's Remark",
    showAttendance: true,
    showNextTermDate: true,
  },
};

export const TEMPLATE_PRESETS: { id: string; label: string; section: string; layout: TemplateLayout }[] = [
  { id: "nursery-glitters-1", label: "Nursery – Glitters 1 (Competency)", section: "nursery", layout: NURSERY_GLITTERS_ONE },
  { id: "nursery-glitters-2", label: "Nursery – Glitters 2 (Competency)", section: "nursery", layout: NURSERY_GLITTERS_TWO },
  { id: "primary-score",      label: "Primary – Score-based",             section: "primary", layout: PRIMARY_SCORE_DEFAULT },
  { id: "secondary-score",    label: "Secondary – Score-based",           section: "secondary", layout: { ...PRIMARY_SCORE_DEFAULT } },
];
