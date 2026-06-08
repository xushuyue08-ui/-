import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer


NOTICE = "传统文化内容仅供参考，请结合现实情况理性判断。"


class ReusableTCPServer(ThreadingTCPServer):
    allow_reuse_address = True


def load_dotenv():
    if not os.path.exists(".env"):
        return
    with open(".env", "r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.lstrip("\ufeff")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def extract_output_text(payload):
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    parts = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts).strip()


def normalize_ai_text(text):
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            data.setdefault("notice", NOTICE)
            return data
    except json.JSONDecodeError:
        pass
    return {"raw": text, "sections": [], "notice": NOTICE}


def build_prompt(body):
    sign = body.get("sign", {})
    categories = sign.get("sourceCategories") or {}
    return (
        "请基于以下吕祖灵签资料，为用户生成现代问事解读。"
        "要求：1. 不做绝对预测；2. 不提供医疗、法律、投资等确定性结论；"
        "3. 语气沉静克制；4. 只输出 JSON，不要 Markdown。"
        "\nJSON 格式："
        '{"sections":[{"title":"本签与所问之事","content":"..."},'
        '{"title":"有利因素","content":"..."},'
        '{"title":"风险与阻碍","content":"..."},'
        '{"title":"行动建议","content":"..."},'
        '{"title":"不宜事项","content":"..."},'
        '{"title":"现实观察信号","content":"..."}]}'
        f"\n签号：第{sign.get('number', '')}签"
        f"\n古人或典故：{sign.get('allusion', '')}"
        f"\n签诗：{' / '.join(sign.get('poem') or [])}"
        f"\n传统简解：{sign.get('summary', '')}"
        f"\n来源分类：{json.dumps(categories, ensure_ascii=False)}"
        f"\n问事类型：{body.get('category') or '未填写'}"
        f"\n用户问题：{body.get('question') or '未填写，仅查看通用签义'}"
    )


def call_openai(body):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("未配置 OPENAI_API_KEY。请先在环境变量或 .env 中配置 API Key。")
    model = os.environ.get("OPENAI_MODEL", "gpt-5.2")

    payload = {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": "你是一个传统文化网站的解签辅助写作者，只做参考性、结构化、理性表达。"
            },
            {"role": "user", "content": build_prompt(body)}
        ]
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API 请求失败：{exc.code} {detail[:300]}") from exc

    text = extract_output_text(result)
    if not text:
        raise RuntimeError("OpenAI API 未返回可读取文本。")
    return normalize_ai_text(text)


def call_deepseek(body):
    api_key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY。请先在环境变量或 .env 中配置 DeepSeek API Key。")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是一个传统文化网站的解签辅助写作者，只做参考性、结构化、理性表达。只输出 JSON。"
            },
            {"role": "user", "content": build_prompt(body)}
        ],
        "stream": False,
        "temperature": 0.4,
        "max_tokens": 1200
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek API 请求失败：{exc.code} {detail[:300]}") from exc

    choices = result.get("choices") or []
    text = ""
    if choices:
        text = (choices[0].get("message") or {}).get("content") or ""
    if not text:
        raise RuntimeError("DeepSeek API 未返回可读取文本。")
    return normalize_ai_text(text)


def call_ai(body):
    provider = os.environ.get("AI_PROVIDER", "openai").lower()
    if provider == "deepseek":
        return call_deepseek(body)
    return call_openai(body)


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/ai-reading":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 30000:
                raise RuntimeError("请求内容过长。")
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            result = call_ai(body)
            self.send_json(200, result)
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    load_dotenv()
    port = int(os.environ.get("PORT", "8905"))
    host = os.environ.get("HOST", "0.0.0.0")
    with ReusableTCPServer((host, port), Handler) as httpd:
        local_url = f"http://127.0.0.1:{port}"
        print(f"吕祖灵签服务已启动：{local_url}")
        print(f"监听地址：{host}:{port}")
        print("AI 接口：POST /api/ai-reading")
        httpd.serve_forever()
