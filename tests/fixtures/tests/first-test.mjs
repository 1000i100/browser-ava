import test from "ava";

test("test.1", t => {
  t.log("1st. assertion is coming soon");
  t.is(1, 1, "assert title 1");
});

test("test.2", t => {
  t.true(1 === 2, "assert title 2");
});

test.serial("test.serial.1", t => {
  t.true(1 === 1);
});

test.serial("test.serial.2", t => {
  t.true(1 === 1);
});

test.failing("test.failing", t => {
  t.true(1 === 2, "assert title 2");
});

test.todo("todo");
test.serial.todo("serial.todo");
