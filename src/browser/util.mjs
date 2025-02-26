export function calculateSummary(testModules) {
  let failed = 0,
    knownFailure = 0,
    todo = 0,
    skip = 0,
    passed = 0;

  for (const tm of testModules) {
    for (const test of tm.tests) {
      if (test.skip) {
        skip++;
      } else {
        if (test.todo) {
          todo++;
        } else {
          if (test.passed) {
            passed++;
          } else {
            if (test.failing) {
              knownFailure++;
            } else {
              if(test.passed === false) {
                failed++;
              }
            }
          }
        }
      }
    }
  }

  return { passed, failed, knownFailure, skip, todo };
}

export function pluralize(word, number) {
  return number > 1 ? word + "s" : word;
}
export function summaryMessages(summary) {
  const messages = [];

  function message(number, word, template, colorClass = "") {
    if (number >= 1) {
      const text = template
        .replace(/{number}/, number)
        .replace(/{word}/, pluralize(word, number));
      messages.push({
        colorClass,
        text,
        html: `<div class="${colorClass}">${text}</div>`
      });
    }
  }

  message(summary.passed, "test", "{number} {word} passed", "passed");
  message(summary.failed, "test", "{number} {word} failed", "failed");
  message(summary.knownFailure, "failure", "{number} known {word}", "failed");
  message(summary.skip, "test", "{number} {word} skipped", "skip");
  message(summary.todo, "test", "{number} {word} todo", "todo");

  return messages;
}
