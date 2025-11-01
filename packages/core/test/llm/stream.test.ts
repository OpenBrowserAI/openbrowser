function createReadableStream(): ReadableStream<String> {
  let array: string[] = [];
  let count = 0;
  let timer = setInterval(() => {
    array.push('count: ' + (++count));
  }, 200);
  return new ReadableStream({
    start(controller) {
      controller.enqueue("Hello");
      controller.enqueue("World");
    },
    async pull(controller) {
      while (array.length == 0) {
        await (new Promise((resolve) => setTimeout(resolve, 20)));
      }
      controller.enqueue(array.pop());
      if (count >= 10) {
        clearInterval(timer);
        controller.close();
      }
    },
    cancel(reason) {
      console.log("Stream was cancelled", reason);
    }
  });
}

test.only("stream", async () => {
  let stream: ReadableStream<String> = createReadableStream();
  let reader = stream.getReader();
  try {
    while (true) {
      let { done, value } = await reader.read();
      if (done) {
        break
      }
      console.log('value: ', value);
    }
  } finally {
    reader.releaseLock()
  }
})