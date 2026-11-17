// Pearson Edexcel International GCSE specifications (current specs, first exam 2018/2019).
// Topic trees mirror the specification section numbering; admins can refine them later.
type TopicSeed = { code: string; name: string; children?: TopicSeed[] };
export type SubjectSeed = {
  board: "edexcel" | "cambridge";
  qualification: string;
  name: string;
  specCode: string;
  topics: TopicSeed[];
};

const t = (code: string, name: string, children?: TopicSeed[]): TopicSeed => ({ code, name, children });

export const SUBJECTS: SubjectSeed[] = [
  {
    board: "edexcel",
    qualification: "International GCSE",
    name: "Mathematics A",
    specCode: "4MA1",
    topics: [
      t("1", "Numbers and the number system", [
        t("1.1", "Integers"), t("1.2", "Fractions"), t("1.3", "Decimals"),
        t("1.4", "Powers and roots"), t("1.5", "Set language and notation"),
        t("1.6", "Percentages"), t("1.7", "Ratio and proportion"),
        t("1.8", "Degree of accuracy"), t("1.9", "Standard form"),
        t("1.10", "Applying number"), t("1.11", "Electronic calculators"),
      ]),
      t("2", "Equations, formulae and identities", [
        t("2.1", "Use of symbols"), t("2.2", "Algebraic manipulation"),
        t("2.3", "Expressions and formulae"), t("2.4", "Linear equations"),
        t("2.5", "Proportion"), t("2.6", "Simultaneous linear equations"),
        t("2.7", "Quadratic equations"), t("2.8", "Inequalities"),
      ]),
      t("3", "Sequences, functions and graphs", [
        t("3.1", "Sequences"), t("3.2", "Function notation"),
        t("3.3", "Graphs"), t("3.4", "Calculus"),
      ]),
      t("4", "Geometry and trigonometry", [
        t("4.1", "Angles, lines and triangles"), t("4.2", "Polygons"),
        t("4.3", "Symmetry"), t("4.4", "Measures"), t("4.5", "Construction"),
        t("4.6", "Circle properties"), t("4.7", "Geometrical reasoning"),
        t("4.8", "Trigonometry and Pythagoras' theorem"),
        t("4.9", "Mensuration of 2D shapes"), t("4.10", "3D shapes and volume"),
        t("4.11", "Similarity"),
      ]),
      t("5", "Vectors and transformation geometry", [
        t("5.1", "Vectors"), t("5.2", "Transformation geometry"),
      ]),
      t("6", "Statistics and probability", [
        t("6.1", "Graphical representation of data"),
        t("6.2", "Statistical measures"), t("6.3", "Probability"),
      ]),
    ],
  },
  {
    board: "edexcel",
    qualification: "International GCSE",
    name: "Physics",
    specCode: "4PH1",
    topics: [
      t("1", "Forces and motion"), t("2", "Electricity"), t("3", "Waves"),
      t("4", "Energy resources and energy transfers"),
      t("5", "Solids, liquids and gases"),
      t("6", "Magnetism and electromagnetism"),
      t("7", "Radioactivity and particles"), t("8", "Astrophysics"),
    ],
  },
  {
    board: "edexcel",
    qualification: "International GCSE",
    name: "Chemistry",
    specCode: "4CH1",
    topics: [
      t("1", "Principles of chemistry"), t("2", "Inorganic chemistry"),
      t("3", "Physical chemistry"), t("4", "Organic chemistry"),
    ],
  },
  {
    board: "edexcel",
    qualification: "International GCSE",
    name: "Biology",
    specCode: "4BI1",
    topics: [
      t("1", "The nature and variety of living organisms"),
      t("2", "Structure and functions in living organisms"),
      t("3", "Reproduction and inheritance"),
      t("4", "Ecology and the environment"),
      t("5", "Use of biological resources"),
    ],
  },
];
