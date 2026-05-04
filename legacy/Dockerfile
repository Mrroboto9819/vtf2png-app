FROM debian:bookworm-slim AS vtf2png-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpng-dev \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG VTF2PNG_COMMIT=e74a1fd24b760a0339ec4d498d0b9fef75d847ff

WORKDIR /build
RUN git clone https://github.com/eXeC64/vtf2png.git . \
    && git checkout ${VTF2PNG_COMMIT} \
    && make \
    && strip vtf2png


FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    KIVY_NO_ARGS=1 \
    KIVY_GL_BACKEND=sdl2

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpng16-16 \
    libsdl2-2.0-0 \
    libsdl2-image-2.0-0 \
    libsdl2-mixer-2.0-0 \
    libsdl2-ttf-2.0-0 \
    libgl1 \
    libgles2 \
    libmtdev1 \
    libusb-1.0-0 \
    xclip \
    xsel \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN sed -i '/^pywin32/d' requirements.txt \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

COPY --from=vtf2png-builder /build/vtf2png /app/libs/vtf2png/vtf2png
RUN chmod +x /app/libs/vtf2png/vtf2png

CMD ["python", "ui_vtf2png.py"]
