// An uploaded file is untrusted: a blob URL runs in the app's own
// origin, so anything that can execute script must be downloaded,
// never opened in a tab.
import { openFileBlob } from "./openFile";

describe("openFileBlob", () => {
  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => "blob:test");
    URL.revokeObjectURL = jest.fn();
    window.open = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test("opens a PDF in a tab without an opener", () => {
    openFileBlob(new Blob(["x"], { type: "application/pdf" }));
    expect(window.open).toHaveBeenCalledWith("blob:test", "_blank", "noopener");
  });

  test.each(["text/html", "image/svg+xml", "application/xml", ""])(
    "downloads %p instead of opening it",
    (type) => {
      openFileBlob(new Blob(["<script>1</script>"], { type }), "evil");
      expect(window.open).not.toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    },
  );
});
