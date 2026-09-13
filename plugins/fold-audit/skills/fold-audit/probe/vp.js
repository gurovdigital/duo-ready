if (new URLSearchParams(window.location.search).get("pos") === "sticky") {
  document.getElementById("bar").classList.add("is-sticky");
  document.body.classList.add("is-sticky");
  document.getElementById("bar").textContent = "STICKY BAR";
}

const px = v => (typeof v === "number" ? Math.round(v * 100) / 100 + "" : String(v));

      function envVal(side) {
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;top:-9999px;height:env(safe-area-inset-" + side + ",0px);";
        document.body.appendChild(probe);
        const h = getComputedStyle(probe).height;
        probe.remove();
        return h;
      }

      function fill(id, rows) {
        document.getElementById(id).innerHTML = rows
          .map(
            ([k, v, hot]) =>
              '<tr class="' + (hot ? "hot" : "") + '"><td>' + k + "</td><td>" + px(v) + "</td></tr>",
          )
          .join("");
      }

      function update() {
        const bar = document.getElementById("bar");
        const r = bar.getBoundingClientRect();
        const vv = window.visualViewport;

        fill("t1", [
          ["inset-top", envVal("top"), envVal("top") !== "0px"],
          ["inset-bottom", envVal("bottom")],
          ["inset-left", envVal("left")],
          ["inset-right", envVal("right")],
        ]);

        fill("t2", [
          ["bar rect top", r.top, Math.abs(r.top) > 0.5],
          ["bar rect bottom", r.bottom],
          ["bar height", r.height],
          ["computed top", getComputedStyle(bar).top],
          ["offsetParent", bar.offsetParent ? bar.offsetParent.tagName : "null (viewport)"],
        ]);

        fill("t3", [
          ["innerWidth", window.innerWidth],
          ["clientWidth", document.documentElement.clientWidth],
          ["screen.width", window.screen ? window.screen.width : "-"],
          ["orientation", window.screen && screen.orientation ? screen.orientation.type : "-"],
          ["Duo width", window.innerWidth >= 880 && window.innerWidth <= 962
            ? (Math.abs(window.innerWidth - 890) < Math.abs(window.innerWidth - 951) ? "close to 890 (spec sheet)" : "close to 951 (App Store Connect)")
            : "not an opened Duo", window.innerWidth >= 880 && window.innerWidth <= 962],
          ["window.scrollY", window.scrollY],
          ["innerHeight", window.innerHeight],
          ["clientHeight", document.documentElement.clientHeight],
          ["vv.offsetTop", vv ? vv.offsetTop : "no visualViewport", vv && vv.offsetTop !== 0],
          ["vv.pageTop", vv ? vv.pageTop : "-"],
          ["vv.height", vv ? vv.height : "-"],
          ["vv.scale", vv ? vv.scale : "-"],
          ["screen.height", window.screen ? window.screen.height : "-"],
          ["devicePixelRatio", window.devicePixelRatio],
        ]);

        fill("t4", [
          ["Duo fold rule on", String(matchMedia("(min-width: 880px) and (max-width: 962px) and (pointer: coarse)").matches)],
          ["standalone", String(navigator.standalone)],
          ["UA", (navigator.userAgent || "").slice(-60)],
        ]);
      }

      update();
      addEventListener("scroll", update, { passive: true });
      addEventListener("resize", update);
      if (window.visualViewport) {
        visualViewport.addEventListener("resize", update);
        visualViewport.addEventListener("scroll", update);
      }
      setTimeout(update, 600);
