typedef unsigned char u8;
extern int fseek(void *, long, int);
void rewind(void *);
void rewind(void *f) {
    ((u8 *)f)[0xD] = 0;
    fseek(f, 0, 0);
    ((u8 *)f)[0xD] = 0;
}
