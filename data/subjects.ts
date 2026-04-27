export interface SubjectDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgLight: string;
  subtitle: string;
  status: "active" | "coming_soon";
  topicCount: number;
  plannedTopics: string[] | null;
}

const subjects: SubjectDef[] = [
  {
    id: "math",
    name: "Mathematics",
    icon: "\u2211",
    color: "#2563EB",
    bgLight: "#EFF6FF",
    subtitle: "8 units \u00b7 Grade 7",
    status: "active",
    topicCount: 42,
    plannedTopics: null,
  },
  {
    id: "science",
    name: "Science",
    icon: "\uD83D\uDD2C",
    color: "#7C3AED",
    bgLight: "#F5F3FF",
    subtitle: "General Science \u00b7 Grade 7",
    status: "coming_soon",
    topicCount: 5,
    plannedTopics: [
      "States of matter",
      "Forces and motion",
      "Energy and work",
      "Cells and organisms",
      "Earth systems",
    ],
  },
  {
    id: "english",
    name: "English",
    icon: "\uD83D\uDCD6",
    color: "#059669",
    bgLight: "#ECFDF5",
    subtitle: "Language Arts \u00b7 Grade 7",
    status: "coming_soon",
    topicCount: 5,
    plannedTopics: [
      "Reading comprehension",
      "Grammar fundamentals",
      "Sentence structure",
      "Paragraph writing",
      "Vocabulary building",
    ],
  },
];

export default subjects;
