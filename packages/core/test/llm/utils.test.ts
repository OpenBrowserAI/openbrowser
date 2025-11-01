import { call_timeout, sleep } from "../../src/common/utils";

test.only("test", async () => {
  console.log("start ====>");
  let result1 = await call_timeout(
    async () => {
      await sleep(100);
      return 1;
    },
    200,
    (e) => {
      console.log("___error1___", e);
    }
  );
  console.log("result1 ===> ", result1);
  let result2 = await call_timeout(
    async () => {
      await sleep(300);
      return 2;
    },
    200,
    (e) => {
      console.log("___error2___", e);
    }
  );
  console.log("result2 ===> ", result2);
});
