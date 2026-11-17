import { describe, expect, it } from "vitest";
import { normalizePaper, parsePaperFilename } from "./paper-filename";

describe("parsePaperFilename", () => {
  it("parses the canonical Edexcel form", () => {
    expect(parsePaperFilename("4MA1_1H_2020_06_qp.pdf")).toEqual({
      specCode: "4MA1", paperCode: "4MA1/1H", series: "June", year: 2020, tier: "H",
    });
    expect(parsePaperFilename("4PH1_2F_2019_11_QP.pdf")).toMatchObject({
      paperCode: "4PH1/2F", series: "November", tier: "F",
    });
  });

  it("parses download-site names (all 7 Maths B samples)", () => {
    const cases: [string, string, number][] = [
      ["IGCSE_MATHEMATICS_B_2019_Jan_P1_QP_1777808603285.pdf", "January", 2019],
      ["IGCSE_MATHEMATICS_B_2019_MayJune_P1_QP.pdf", "June", 2019],
      ["IGCSE_MATHEMATICS_B_2020_Jan_P1_QP.pdf", "January", 2020],
      ["IGCSE_MATHEMATICS_B_2020_MayJune_P1_QP.pdf", "June", 2020],
      ["IGCSE_MATHEMATICS_B_2021_Jan_P1_QP.pdf", "January", 2021],
      ["IGCSE_MATHEMATICS_B_2021_MayJune_P1_QP.pdf", "June", 2021],
      ["IGCSE_MATHEMATICS_B_2021_Nov_P1_QP.pdf", "November", 2021],
    ];
    for (const [name, series, year] of cases) {
      expect(parsePaperFilename(name)).toEqual({
        specCode: "4MB1", paperCode: "4MB1/01", series, year, tier: null,
      });
    }
  });

  it("parses Pearson's own file names, including October series", () => {
    expect(parsePaperFilename("WPH13_01_que_20240123.pdf")).toEqual({
      specCode: "WPH13", paperCode: "WPH13/01", series: "January", year: 2024, tier: null,
    });
    expect(parsePaperFilename("WPH13_01_que_20231011.pdf")?.series).toBe("October");
  });

  it("ignores folders inside a zip", () => {
    expect(parsePaperFilename("maths/b/IGCSE_MATHEMATICS_B_2021_Nov_P1_QP.pdf")?.year).toBe(2021);
  });

  it("returns null for mark schemes and unknown names", () => {
    expect(parsePaperFilename("4MA1_1H_2020_06_ms.pdf")).toBeNull();
    expect(parsePaperFilename("IGCSE_MATHEMATICS_B_2021_Nov_P1_MS.pdf")).toBeNull();
    expect(parsePaperFilename("random.pdf")).toBeNull();
  });
});

describe("normalizePaper", () => {
  it("pads untiered papers and keeps tiered ones", () => {
    expect(normalizePaper("P1")).toEqual({ paper: "01", tier: null });
    expect(normalizePaper("1R")).toEqual({ paper: "01R", tier: null });
    expect(normalizePaper("1H")).toEqual({ paper: "1H", tier: "H" });
    expect(normalizePaper("2FR")).toEqual({ paper: "2FR", tier: "F" });
  });
});
