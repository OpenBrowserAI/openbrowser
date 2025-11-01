import Log from "../src/common/log";

function sum(a: number, b: number) {
  return a + b;
}

describe("demo test", () => {
  test("test: 1 + 2 = 3", () => {
    Log.info("1+2=?");
    expect(sum(1, 2)).toBe(3);
  });
});
