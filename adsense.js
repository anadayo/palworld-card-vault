(() => {
  const config = Object.freeze({
    client: "",
    slots: { home: "" },
  });
  const preview = ["localhost", "127.0.0.1"].includes(location.hostname)
    && new URLSearchParams(location.search).get("adPreview") === "1";
  const clientReady = /^ca-pub-\d{16}$/.test(config.client);

  document.querySelectorAll("[data-ad-slot]").forEach((container) => {
    const slot = config.slots[container.dataset.adSlot];
    if (preview && !clientReady) {
      container.classList.add("is-ready", "is-preview");
      container.innerHTML = '<span class="ad-slot-label">広告プレビュー</span><div style="min-height:90px;display:grid;place-items:center;border:1px dashed currentColor;border-radius:8px;opacity:.55">AdSense 審査後に配信</div>';
      return;
    }
    if (!clientReady || !/^\d+$/.test(slot || "")) return;
    container.classList.add("is-ready");
    container.innerHTML = `<span class="ad-slot-label">広告</span><ins class="adsbygoogle" style="display:block" data-ad-client="${config.client}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });

  if (!clientReady || document.querySelector('script[data-vault-adsense="1"]')) return;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.dataset.vaultAdsense = "1";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.client}`;
  document.head.append(script);
})();
