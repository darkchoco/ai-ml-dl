import numpy as np
from keras import Sequential
from keras.layers import Dense

# Sequential class로 layer를 정의. Dense는 그 layer의 형태가 어떤 것인지를 의미한다.
# Dense => 뉴런이 완전히(또는 조밀하게) 연결되어 있다는 것.
# units=1 => 이 layer는 한개의 뉴런을 가진다.
model = Sequential([Dense(units=1, input_shape=[1])])
model.compile(optimizer='sgd', loss='mean_squared_error')

xs = np.array([-1.0, 0.0, 1.0, 2.0, 3.0, 4.0], dtype=float)
ys = np.array([-3.0, -1.0, 1.0, 3.0, 5.0, 7.0], dtype=float)

model.fit(xs, ys, epochs=500)

print(model.predict([10.0]))
