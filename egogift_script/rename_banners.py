import os

banner_dir = r"C:\Git\yeon-sim\yeon-sim.github.io\static\images\banner"

rename_map = {
    "사랑할수없는.png": "1005.png",
    "못과망치.png": "1006.png",
    "신앙과침식.png": "1007.png",
    "마주하지않는.png": "1008.png",
    "둥지공방기술.png": "1009.png",
    "낙화.png": "1010.png",
    "흘리는것들.png": "1011.png",
    "변하지않는.png": "1012.png",
    "레이크월드.png": "1013.png",
    "기어오는심연.png": "1014.png",
    "악으로규정되는.png": "1015.png",
    "저택의부산물.png": "1016.png",
    "어느세계.png": "1017.png",
    "마음이어긋나는.png": "1018.png",
    "다시열린라만차랜드.png": "1019.png",
    "끝나지않는행렬.png": "1020.png",
    "꿈이끝나는.png": "1021.png",
    "사대가문과욕망.png": "1022.png",
    "바라볼수밖에없는.png": "1023.png",
    "현혹방황불신.png": "1024.png",
    "교본.png": "1025.png",
    "검과작품.png": "1026.png",
    "끊어지지않는.png": "1027.png",
    "헬스치킨.png": "1101.png",
    "우미다.png": "1102.png",
    "20번구의기적.png": "1103.png",
    "육참골단.png": "1104.png",
    "시살시.png": "1105.png",
    "워특살.png": "1106.png",
    "자정오.png": "1107.png",
    "1호선.png": "1108.png",
    "2호선.png": "1109.png",
    "3호선.png": "1110.png",
    "4호선3구간.png": "1111.png",
    "4호선4구간.png": "1112.png",
    "20번구복각.png": "1113.png",
    "탄환이찍은마침표.png": "1114.png",
    "정기검진.png": "1115.png",
    "육참골단복각.png": "1116.png",
    "심야청소.png": "1117.png",
    "5호선.png": "1118.png",
    "증오와절망.png": "1119.png",
    "시살시복각.png": "1120.png",
    "절차탁춘.png": "1121.png",
    "워특살복각.png": "1123.png",
    "호박색어스름.png": "1124.png",
    "정기검진복각.png": "1125.png",
}

success, skip, error = 0, 0, 0

for old_name, new_name in rename_map.items():
    src = os.path.join(banner_dir, old_name)
    dst = os.path.join(banner_dir, new_name)
    if not os.path.exists(src):
        print(f"[SKIP] 없음: {old_name}")
        skip += 1
        continue
    if os.path.exists(dst):
        print(f"[SKIP] 이미 존재: {new_name}")
        skip += 1
        continue
    try:
        os.rename(src, dst)
        print(f"[OK] {old_name} → {new_name}")
        success += 1
    except Exception as e:
        print(f"[ERR] {old_name}: {e}")
        error += 1

print(f"\n완료: 성공 {success}개 / 스킵 {skip}개 / 오류 {error}개")
